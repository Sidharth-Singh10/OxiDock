use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tokio::io::AsyncWriteExt;

use crate::errors::{AppError, AppResult};
use crate::ssh_manager::SshSession;

static THUMB_EVICTION_RUNNING: AtomicBool = AtomicBool::new(false);
static IMAGE_EVICTION_RUNNING: AtomicBool = AtomicBool::new(false);

/// 50 MB cap for the thumbnail disk cache.
const THUMB_CACHE_MAX_BYTES: u64 = 50 * 1024 * 1024;
/// 200 MB cap for the full-image disk cache.
const IMAGE_CACHE_MAX_BYTES: u64 = 200 * 1024 * 1024;

/// Evict oldest files from a cache directory until total size is under `max_bytes`.
/// Sorts by modification time (oldest first) as an LRU proxy.
fn evict_cache_lru(cache_dir: &std::path::Path, max_bytes: u64) {
    let rd = match std::fs::read_dir(cache_dir) {
        Ok(rd) => rd,
        Err(_) => return,
    };

    let mut files: Vec<(std::path::PathBuf, u64, u64)> = Vec::new();
    let mut total_size: u64 = 0;

    for entry in rd.filter_map(|e| e.ok()) {
        let Ok(meta) = entry.metadata() else {
            continue;
        };
        if !meta.is_file() {
            continue;
        }
        let size = meta.len();
        let mtime = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        total_size += size;
        files.push((entry.path(), size, mtime));
    }

    if total_size <= max_bytes {
        return;
    }

    files.sort_by_key(|&(_, _, mtime)| mtime);

    let to_free = total_size - max_bytes;
    let mut freed: u64 = 0;
    let mut evicted = 0u32;

    for (path, size, _) in &files {
        if freed >= to_free {
            break;
        }
        if std::fs::remove_file(path).is_ok() {
            freed += size;
            evicted += 1;
        }
    }

    log::info!(
        "[CACHE] eviction: removed {} files, freed {:.1} MB (was {:.1} MB, cap {:.1} MB)",
        evicted,
        freed as f64 / (1024.0 * 1024.0),
        total_size as f64 / (1024.0 * 1024.0),
        max_bytes as f64 / (1024.0 * 1024.0),
    );
}

/// A file entry returned to the frontend.
#[derive(Debug, Clone, Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: Option<String>,
    pub is_image: bool,
}

/// Returns true if the file extension is a supported image format.
pub fn is_image_ext(name: &str) -> bool {
    let ext = name.rsplit('.').next().unwrap_or("").to_lowercase();
    matches!(
        ext.as_str(),
        "png" | "jpg" | "jpeg" | "gif" | "bmp" | "webp" | "avif" | "heic" | "svg"
    )
}

/// List directory contents via SFTP.
pub async fn list_dir(session: &Arc<SshSession>, path: &str) -> AppResult<Vec<FileEntry>> {
    let total_start = std::time::Instant::now();

    let sftp_acquire_start = std::time::Instant::now();
    let sftp = session.sftp().await?;
    let sftp_acquire_ms = sftp_acquire_start.elapsed().as_secs_f64() * 1000.0;

    let readdir_start = std::time::Instant::now();
    let entries = sftp
        .read_dir(path)
        .await
        .map_err(|e| AppError::Sftp(format!("Failed to read directory: {e}")))?;
    let readdir_ms = readdir_start.elapsed().as_secs_f64() * 1000.0;

    let mut files: Vec<FileEntry> = Vec::new();
    for entry in entries {
        let name = entry.file_name();
        if name == "." || name == ".." {
            continue;
        }
        let full_path = if path.ends_with('/') {
            format!("{path}{name}")
        } else {
            format!("{path}/{name}")
        };

        let attrs = &entry.metadata();
        let is_dir = attrs.is_dir();
        let size = attrs.size.unwrap_or(0);
        let modified = attrs.mtime.map(|t| {
            chrono::DateTime::from_timestamp(t as i64, 0)
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_default()
        });

        let is_image = if is_dir { false } else { is_image_ext(&name) };
        files.push(FileEntry {
            name,
            path: full_path,
            is_dir,
            size,
            modified,
            is_image,
        });
    }

    // Sort: directories first, then by name
    files.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    let total_ms = total_start.elapsed().as_secs_f64() * 1000.0;
    log::info!(
        "[PERF] list_dir \"{}\" — total: {:.2}ms | sftp_acquire: {:.2}ms | read_dir: {:.2}ms | entries: {}",
        path,
        total_ms,
        sftp_acquire_ms,
        readdir_ms,
        files.len(),
    );

    Ok(files)
}

/// Read a file preview (first N bytes).
pub async fn read_file_preview(
    session: &Arc<SshSession>,
    path: &str,
    max_bytes: usize,
) -> AppResult<FilePreview> {
    let start = std::time::Instant::now();
    let sftp = session.sftp().await?;

    let data = sftp
        .read(path)
        .await
        .map_err(|e| AppError::Sftp(format!("Failed to read file: {e}")))?;

    log::info!(
        "[PERF] read_file_preview \"{}\" — {:.2}ms | size: {} bytes",
        path,
        start.elapsed().as_secs_f64() * 1000.0,
        data.len(),
    );

    let truncated = data.len() > max_bytes;
    let preview_data = if truncated { &data[..max_bytes] } else { &data };

    // Try to detect if it's text or binary
    let is_text = preview_data
        .iter()
        .all(|&b| b == b'\n' || b == b'\r' || b == b'\t' || (b >= 0x20 && b <= 0x7E) || b >= 0x80);

    if is_text {
        let text = String::from_utf8_lossy(preview_data).to_string();
        Ok(FilePreview {
            content: text,
            is_text: true,
            truncated,
            total_size: data.len() as u64,
        })
    } else {
        let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, preview_data);
        Ok(FilePreview {
            content: b64,
            is_text: false,
            truncated,
            total_size: data.len() as u64,
        })
    }
}

/// Fetch a small slice of an image for thumbnail display.
/// Downloads up to 10MB of the file and uses libvips to decode and generate
/// a fast WebP thumbnail natively, returning a base64 string.
pub async fn get_thumbnail(
    session: &Arc<SshSession>,
    path: &str,
    _max_bytes: usize, // Ignored, we cap at 10MB now.
    cache_dir: &std::path::Path,
    remote_mtime: Option<u64>,
) -> AppResult<String> {
    use tokio::io::AsyncReadExt;

    // Build a stable cache filename
    let safe_key = base64::Engine::encode(
        &base64::engine::general_purpose::URL_SAFE_NO_PAD,
        path.as_bytes(),
    );
    let cache_file = cache_dir.join(format!("{safe_key}_thumb.webp"));

    // Mtime-based freshness: reuse cached thumbnail only if it was written
    // after the remote file was last modified.
    if cache_file.exists() {
        let fresh = if let Some(remote_mt) = remote_mtime {
            std::fs::metadata(&cache_file)
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() >= remote_mt)
                .unwrap_or(false)
        } else {
            true // no mtime info — trust existing cache
        };

        if fresh {
            if let Ok(data) = tokio::fs::read(&cache_file).await {
                let b64 =
                    base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &data);
                log::info!(
                    "[CACHE] thumbnail cache hit for \"{}\" — skipping download",
                    path
                );
                return Ok(b64);
            }
        } else {
            log::info!(
                "[CACHE] thumbnail stale for \"{}\" — remote mtime is newer, regenerating",
                path
            );
        }
    }

    let start = std::time::Instant::now();
    let sftp = session.sftp().await?;

    let mut file = sftp
        .open(path)
        .await
        .map_err(|e| AppError::Sftp(format!("Failed to open image for thumbnail: {e}")))?;

    // Download up to 10MB
    let limit: u64 = 10 * 1024 * 1024;
    let mut buf = Vec::new();
    let n = file
        .take(limit)
        .read_to_end(&mut buf)
        .await
        .map_err(|e| AppError::Sftp(format!("Failed to read thumbnail bytes: {e}")))?;

    let read_ms = start.elapsed().as_secs_f64() * 1000.0;

    // Spawn blocking task for CPU-intensive image processing
    let (b64, webp_data) = tokio::task::spawn_blocking(move || {
        let process_start = std::time::Instant::now();

        // 1. Decode image from raw bytes
        let img = image::load_from_memory(&buf)
            .map_err(|e| AppError::Sftp(format!("Image decode failed: {e}")))?;

        // 2. Setup fast_image_resize Source image
        let width = img.width().max(1);
        let height = img.height().max(1);
        let src_image = fast_image_resize::images::Image::from_vec_u8(
            width,
            height,
            img.to_rgba8().into_raw(),
            fast_image_resize::PixelType::U8x4,
        )
        .map_err(|e| AppError::Sftp(format!("Failed to create fir source image: {e}")))?;

        // 3. Setup fast_image_resize Destination image (256x256 max bounds, maintaining aspect ratio)
        let aspect_ratio = img.width() as f32 / img.height() as f32;
        let (dst_width, dst_height) = if aspect_ratio > 1.0 {
            (256, (256.0 / aspect_ratio).round() as u32)
        } else {
            ((256.0 * aspect_ratio).round() as u32, 256)
        };
        let dst_width = dst_width.max(1);
        let dst_height = dst_height.max(1);

        let mut dst_image = fast_image_resize::images::Image::new(
            dst_width,
            dst_height,
            fast_image_resize::PixelType::U8x4,
        );

        // 4. Resize using Bilinear filter for speed
        let mut resizer = fast_image_resize::Resizer::new();
        resizer
            .resize(
                &src_image,
                &mut dst_image,
                &fast_image_resize::ResizeOptions::new().resize_alg(
                    fast_image_resize::ResizeAlg::Convolution(
                        fast_image_resize::FilterType::Bilinear,
                    ),
                ),
            )
            .map_err(|e| AppError::Sftp(format!("Image resize failed: {e}")))?;

        // 5. Convert back to image crate types and encode WebP
        let resized_img = image::ImageBuffer::<image::Rgba<u8>, _>::from_raw(
            dst_width,
            dst_height,
            dst_image.into_vec(),
        )
        .ok_or_else(|| AppError::Sftp("Failed to convert resized buffer".into()))?;

        let dynamic_img = image::DynamicImage::ImageRgba8(resized_img);
        let mut webp_buf = std::io::Cursor::new(Vec::new());
        // Using `write_to` with standard WebP format (which we enabled in Cargo.toml via webp feature)
        dynamic_img
            .write_to(&mut webp_buf, image::ImageFormat::WebP)
            .map_err(|e| AppError::Sftp(format!("WebP encoding failed: {e}")))?;

        let webp_data = webp_buf.into_inner();
        let b64_str =
            base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &webp_data);

        log::info!(
            "[PERF] fast_image_resize processing — {:.2}ms",
            process_start.elapsed().as_secs_f64() * 1000.0
        );

        Ok::<_, AppError>((b64_str, webp_data))
    })
    .await
    .map_err(|e| AppError::Sftp(format!("Thumbnail task panicked: {e}")))?
    .map_err(|e| {
        log::error!("[CMD] sftp_get_thumbnail Error \"{}\": {}", path, e);
        e
    })?;

    log::info!(
        "[PERF] get_thumbnail \"{}\" — total: {:.2}ms | bytes_read: {} (up to 10MB)",
        path,
        start.elapsed().as_secs_f64() * 1000.0,
        n,
    );

    // Write to cache in the background (we can just await it since it's tiny)
    if let Err(e) = tokio::fs::write(&cache_file, &webp_data).await {
        log::warn!("Failed to save thumbnail to cache: {}", e);
    }

    // Background LRU eviction — keep thumbnail dir under THUMB_CACHE_MAX_BYTES
    if !THUMB_EVICTION_RUNNING.swap(true, Ordering::Relaxed) {
        let dir = cache_dir.to_path_buf();
        tokio::task::spawn_blocking(move || {
            evict_cache_lru(&dir, THUMB_CACHE_MAX_BYTES);
            THUMB_EVICTION_RUNNING.store(false, Ordering::Relaxed);
        });
    }

    Ok(b64)
}

/// Download a full image to the local cache dir and return the cached path.
/// Uses mtime-based freshness: skips download if the cached file's mtime matches the remote.
pub async fn cache_image(
    session: &Arc<SshSession>,
    path: &str,
    cache_dir: &std::path::Path,
    remote_mtime: Option<u64>,
) -> AppResult<String> {
    let start = std::time::Instant::now();

    // Build a stable cache filename: sha256 is heavy, so we use a URL-safe base64 of the path.
    let ext = path.rsplit('.').next().unwrap_or("bin");
    let safe_key = base64::Engine::encode(
        &base64::engine::general_purpose::URL_SAFE_NO_PAD,
        path.as_bytes(),
    );
    let cache_file = cache_dir.join(format!("{safe_key}.{ext}"));

    // Check freshness: if cached file exists and mtime matches, skip download.
    if cache_file.exists() {
        if let Some(remote_mt) = remote_mtime {
            if let Ok(meta) = std::fs::metadata(&cache_file) {
                if let Ok(modified) = meta.modified() {
                    let cached_ts = modified
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_secs())
                        .unwrap_or(0);
                    if cached_ts >= remote_mt {
                        log::info!("[CACHE] cache hit for \"{}\" — skipping download", path);
                        return Ok(cache_file.to_string_lossy().to_string());
                    }
                }
            }
        } else {
            // No mtime info — trust the existing cached file.
            log::info!("[CACHE] cache hit (no mtime) for \"{}\"", path);
            return Ok(cache_file.to_string_lossy().to_string());
        }
    }

    // Download full image.
    let sftp = session.sftp().await?;
    let data = sftp
        .read(path)
        .await
        .map_err(|e| AppError::Sftp(format!("Failed to download image: {e}")))?;
    tokio::fs::write(&cache_file, &data)
        .await
        .map_err(|e| AppError::Sftp(format!("Failed to write cached image: {e}")))?;

    log::info!(
        "[PERF] cache_image \"{}\" — {:.2}ms | size: {} bytes",
        path,
        start.elapsed().as_secs_f64() * 1000.0,
        data.len(),
    );

    // Background LRU eviction — keep image cache dir under IMAGE_CACHE_MAX_BYTES
    if !IMAGE_EVICTION_RUNNING.swap(true, Ordering::Relaxed) {
        let dir = cache_dir.to_path_buf();
        tokio::task::spawn_blocking(move || {
            evict_cache_lru(&dir, IMAGE_CACHE_MAX_BYTES);
            IMAGE_EVICTION_RUNNING.store(false, Ordering::Relaxed);
        });
    }

    Ok(cache_file.to_string_lossy().to_string())
}

/// Delete a remote file via SFTP.
pub async fn delete_file(session: &Arc<SshSession>, path: &str) -> AppResult<()> {
    let start = std::time::Instant::now();
    let sftp = session.sftp().await?;
    sftp.remove_file(path)
        .await
        .map_err(|e| AppError::Sftp(format!("Failed to delete file: {e}")))?;
    log::info!(
        "[PERF] delete_file \"{}\" — {:.2}ms",
        path,
        start.elapsed().as_secs_f64() * 1000.0,
    );
    Ok(())
}

/// Download a file via SFTP and return the bytes.
pub async fn download_file(session: &Arc<SshSession>, path: &str) -> AppResult<Vec<u8>> {
    let start = std::time::Instant::now();
    let sftp = session.sftp().await?;

    let data = sftp
        .read(path)
        .await
        .map_err(|e| AppError::Sftp(format!("Failed to download file: {e}")))?;

    log::info!(
        "[PERF] download_file \"{}\" — {:.2}ms | size: {} bytes",
        path,
        start.elapsed().as_secs_f64() * 1000.0,
        data.len(),
    );

    Ok(data)
}

/// Download a remote file via SFTP and save it to a local path.
pub async fn save_file(
    session: &Arc<SshSession>,
    remote_path: &str,
    local_path: &str,
) -> AppResult<u64> {
    let start = std::time::Instant::now();
    let sftp = session.sftp().await?;

    let data = sftp
        .read(remote_path)
        .await
        .map_err(|e| AppError::Sftp(format!("Failed to download file: {e}")))?;

    let size = data.len() as u64;

    tokio::fs::write(local_path, &data)
        .await
        .map_err(|e| AppError::Sftp(format!("Failed to write local file: {e}")))?;

    log::info!(
        "[PERF] save_file \"{}\" -> \"{}\" — {:.2}ms | size: {} bytes",
        remote_path,
        local_path,
        start.elapsed().as_secs_f64() * 1000.0,
        size,
    );

    Ok(size)
}

/// Create a directory on the remote server via SFTP.
pub async fn create_dir(session: &Arc<SshSession>, path: &str) -> AppResult<()> {
    let start = std::time::Instant::now();
    let sftp = session.sftp().await?;

    sftp.create_dir(path)
        .await
        .map_err(|e| AppError::Sftp(format!("Failed to create directory: {e}")))?;

    log::info!(
        "[PERF] create_dir \"{}\" — {:.2}ms",
        path,
        start.elapsed().as_secs_f64() * 1000.0,
    );

    Ok(())
}

/// Upload file data to a remote path via SFTP.
pub async fn upload_file(
    session: &Arc<SshSession>,
    remote_path: &str,
    data: &[u8],
) -> AppResult<()> {
    let start = std::time::Instant::now();
    let sftp = session.sftp().await?;

    let mut file = sftp
        .create(remote_path)
        .await
        .map_err(|e| AppError::Sftp(format!("Failed to create file for upload: {e}")))?;

    file.write_all(data)
        .await
        .map_err(|e| AppError::Sftp(format!("Failed to write file data: {e}")))?;

    log::info!(
        "[PERF] upload_file \"{}\" — {:.2}ms | size: {} bytes",
        remote_path,
        start.elapsed().as_secs_f64() * 1000.0,
        data.len(),
    );

    Ok(())
}

/// Preview result returned to the frontend.
#[derive(Debug, Clone, Serialize)]
pub struct FilePreview {
    pub content: String,
    pub is_text: bool,
    pub truncated: bool,
    pub total_size: u64,
}
