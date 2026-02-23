use serde::Serialize;
use std::sync::Arc;

use crate::errors::{AppError, AppResult};
use crate::ssh_manager::SshSession;

/// A file entry returned to the frontend.
#[derive(Debug, Clone, Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: Option<String>,
}

/// List directory contents via SFTP.
pub async fn list_dir(session: &Arc<SshSession>, path: &str) -> AppResult<Vec<FileEntry>> {
    let sftp = session.sftp().await?;

    let entries = sftp
        .read_dir(path)
        .await
        .map_err(|e| AppError::Sftp(format!("Failed to read directory: {e}")))?;

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

        files.push(FileEntry {
            name,
            path: full_path,
            is_dir,
            size,
            modified,
        });
    }

    // Sort: directories first, then by name
    files.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(files)
}

/// Read a file preview (first N bytes).
pub async fn read_file_preview(
    session: &Arc<SshSession>,
    path: &str,
    max_bytes: usize,
) -> AppResult<FilePreview> {
    let sftp = session.sftp().await?;

    let data = sftp
        .read(path)
        .await
        .map_err(|e| AppError::Sftp(format!("Failed to read file: {e}")))?;

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

/// Download a file via SFTP and return the bytes.
pub async fn download_file(session: &Arc<SshSession>, path: &str) -> AppResult<Vec<u8>> {
    let sftp = session.sftp().await?;

    let data = sftp
        .read(path)
        .await
        .map_err(|e| AppError::Sftp(format!("Failed to download file: {e}")))?;

    Ok(data)
}

/// Preview result returned to the frontend.
#[derive(Debug, Clone, Serialize)]
pub struct FilePreview {
    pub content: String,
    pub is_text: bool,
    pub truncated: bool,
    pub total_size: u64,
}
