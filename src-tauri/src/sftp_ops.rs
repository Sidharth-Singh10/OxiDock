use serde::Serialize;
use std::io::SeekFrom;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use russh_sftp::protocol::OpenFlags;
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};

use crate::errors::{AppError, AppResult};
use crate::ssh_manager::SshSession;

static IMAGE_EVICTION_RUNNING: AtomicBool = AtomicBool::new(false);

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
    /// Unix epoch **milliseconds**; formatted on the frontend.
    pub modified: Option<u64>,
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
        // Raw epoch millis — no per-entry chrono formatting or string allocation.
        let modified = attrs.mtime.map(|t| t as u64 * 1000);

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

    // Sort: directories first, then case-insensitive by name.
    // `sort_by_cached_key` computes the lowercase key once per entry instead of
    // allocating on every comparison.
    files.sort_by_cached_key(|e| (!e.is_dir, e.name.to_lowercase()));

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
/// Only the preview window is transferred — the rest of the file is never
/// downloaded, so previewing a large file costs `max_bytes`, not file size.
pub async fn read_file_preview(
    session: &Arc<SshSession>,
    path: &str,
    max_bytes: usize,
) -> AppResult<FilePreview> {
    let start = std::time::Instant::now();
    let sftp = session.sftp().await?;

    // File size first (one stat) so the read window can be sized exactly.
    let known_size = sftp.metadata(path).await.ok().and_then(|m| m.size);

    let mut file = sftp
        .open(path)
        .await
        .map_err(|e| AppError::Sftp(format!("Failed to open file: {e}")))?;

    // With a known size, read exactly min(size, max_bytes). Without one, read
    // one extra byte so truncation can still be detected.
    let read_target = match known_size {
        Some(size) => (size as usize).min(max_bytes),
        None => max_bytes + 1,
    };

    let mut data: Vec<u8> = Vec::with_capacity(read_target.min(256 * 1024));
    let mut remaining = read_target;
    let mut chunk = vec![0u8; 64 * 1024];
    while remaining > 0 {
        let want = remaining.min(chunk.len());
        let n = file
            .read(&mut chunk[..want])
            .await
            .map_err(|e| AppError::Sftp(format!("Failed to read file: {e}")))?;
        if n == 0 {
            break;
        }
        data.extend_from_slice(&chunk[..n]);
        remaining -= n;
    }
    let _ = file.shutdown().await;

    let (truncated, total_size) = match known_size {
        Some(size) => (size as usize > data.len(), size),
        None => {
            let truncated = data.len() > max_bytes;
            if truncated {
                data.truncate(max_bytes);
            }
            // Size is unknown without a full read; report the bytes we have.
            (truncated, data.len() as u64)
        }
    };

    log::info!(
        "[PERF] read_file_preview \"{}\" — {:.2}ms | read: {} bytes | file: {} bytes | truncated: {}",
        path,
        start.elapsed().as_secs_f64() * 1000.0,
        data.len(),
        total_size,
        truncated,
    );

    let preview_data = data.as_slice();

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
            total_size,
        })
    } else {
        let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, preview_data);
        Ok(FilePreview {
            content: b64,
            is_text: false,
            truncated,
            total_size,
        })
    }
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

    // Stream the image to disk in chunks — bounded memory for large files.
    let sftp = session.sftp().await?;
    let mut remote = sftp
        .open(path)
        .await
        .map_err(|e| AppError::Sftp(format!("Failed to open image: {e}")))?;
    let mut local = tokio::fs::File::create(&cache_file)
        .await
        .map_err(|e| AppError::Sftp(format!("Failed to create cache file: {e}")))?;

    let mut buf = vec![0u8; 128 * 1024];
    let mut total: u64 = 0;
    loop {
        let n = remote
            .read(&mut buf)
            .await
            .map_err(|e| AppError::Sftp(format!("Failed to download image: {e}")))?;
        if n == 0 {
            break;
        }
        local
            .write_all(&buf[..n])
            .await
            .map_err(|e| AppError::Sftp(format!("Failed to write cached image: {e}")))?;
        total += n as u64;
    }
    local
        .flush()
        .await
        .map_err(|e| AppError::Sftp(format!("Failed to flush cached image: {e}")))?;
    let _ = remote.shutdown().await;

    log::info!(
        "[PERF] cache_image \"{}\" — {:.2}ms | size: {} bytes",
        path,
        start.elapsed().as_secs_f64() * 1000.0,
        total,
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

/// Delete a remote file or directory via SFTP.
/// When `is_dir` is true, recursively removes all contents before removing the directory itself.
pub async fn delete_entry(session: &Arc<SshSession>, path: &str, is_dir: bool) -> AppResult<()> {
    let start = std::time::Instant::now();

    if is_dir {
        delete_dir_recursive(session, path).await?;
        log::info!(
            "[PERF] delete_dir (recursive) \"{}\" — {:.2}ms",
            path,
            start.elapsed().as_secs_f64() * 1000.0,
        );
    } else {
        let sftp = session.sftp().await?;
        sftp.remove_file(path)
            .await
            .map_err(|e| AppError::Sftp(format!("Failed to delete file: {e}")))?;
        log::info!(
            "[PERF] delete_file \"{}\" — {:.2}ms",
            path,
            start.elapsed().as_secs_f64() * 1000.0,
        );
    }

    Ok(())
}

/// Recursively delete a directory and all its contents.
async fn delete_dir_recursive(session: &Arc<SshSession>, dir_path: &str) -> AppResult<()> {
    let entries = list_dir(session, dir_path).await?;

    for entry in &entries {
        if entry.is_dir {
            Box::pin(delete_dir_recursive(session, &entry.path)).await?;
        } else {
            let sftp = session.sftp().await?;
            sftp.remove_file(&entry.path)
                .await
                .map_err(|e| AppError::Sftp(format!("Failed to delete \"{}\": {e}", entry.path)))?;
        }
    }

    let sftp = session.sftp().await?;
    sftp.remove_dir(dir_path)
        .await
        .map_err(|e| AppError::Sftp(format!("Failed to remove directory \"{dir_path}\": {e}")))?;

    Ok(())
}

/// Download a remote file via SFTP and save it to a local path.
/// Streams in chunks so memory stays bounded regardless of file size.
pub async fn save_file(
    session: &Arc<SshSession>,
    remote_path: &str,
    local_path: &str,
) -> AppResult<u64> {
    let start = std::time::Instant::now();
    let sftp = session.sftp().await?;

    let mut remote = sftp
        .open(remote_path)
        .await
        .map_err(|e| AppError::Sftp(format!("Failed to open remote file: {e}")))?;
    let mut local = tokio::fs::File::create(local_path)
        .await
        .map_err(|e| AppError::Sftp(format!("Failed to create local file: {e}")))?;

    let mut buf = vec![0u8; 128 * 1024];
    let mut size: u64 = 0;
    loop {
        let n = remote
            .read(&mut buf)
            .await
            .map_err(|e| AppError::Sftp(format!("Failed to download file: {e}")))?;
        if n == 0 {
            break;
        }
        local
            .write_all(&buf[..n])
            .await
            .map_err(|e| AppError::Sftp(format!("Failed to write local file: {e}")))?;
        size += n as u64;
    }
    local
        .flush()
        .await
        .map_err(|e| AppError::Sftp(format!("Failed to flush local file: {e}")))?;
    let _ = remote.shutdown().await;

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

/// Upload a single chunk of a file at the given offset.
/// Chunks arrive as the raw invoke body (see `sftp_upload_chunk`); the first
/// chunk (offset 0) creates/truncates the file, later chunks seek and write.
pub async fn upload_chunk(
    session: &Arc<SshSession>,
    remote_path: &str,
    offset: u64,
    data: &[u8],
) -> AppResult<()> {
    let start = std::time::Instant::now();
    let sftp = session.sftp().await?;

    let flags = if offset == 0 {
        OpenFlags::WRITE | OpenFlags::CREATE | OpenFlags::TRUNCATE
    } else {
        OpenFlags::WRITE | OpenFlags::CREATE
    };
    let mut file = sftp
        .open_with_flags(remote_path, flags)
        .await
        .map_err(|e| AppError::Sftp(format!("Failed to open file for upload: {e}")))?;

    if offset > 0 {
        file.seek(SeekFrom::Start(offset))
            .await
            .map_err(|e| AppError::Sftp(format!("Failed to seek for upload: {e}")))?;
    }

    file.write_all(data)
        .await
        .map_err(|e| AppError::Sftp(format!("Failed to write file data: {e}")))?;
    file.shutdown()
        .await
        .map_err(|e| AppError::Sftp(format!("Failed to close upload handle: {e}")))?;

    log::info!(
        "[PERF] upload_chunk \"{}\" — offset: {} | {:.2}ms | chunk: {} bytes",
        remote_path,
        offset,
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
