use std::sync::Arc;
use tauri::{Manager, State};

use crate::errors::{AppError, AppResult};
use crate::key_store::{KeyInfo, KeyStore, KeyType, SUPPORTED_KEY_TYPES};
use crate::sftp_ops::{self, FileEntry, FilePreview};
use crate::ssh_manager::SshSessionManager;

// ─── Key Management Commands ───────────────────────────────────────────

#[tauri::command]
pub async fn store_key(
    key_store: State<'_, Arc<KeyStore>>,
    name: String,
    key_pem: String,
) -> AppResult<KeyInfo> {
    key_store.store_key(name, key_pem).await
}

#[tauri::command]
pub async fn list_keys(key_store: State<'_, Arc<KeyStore>>) -> AppResult<Vec<KeyInfo>> {
    key_store.list_keys().await
}

#[tauri::command]
pub async fn delete_key(key_store: State<'_, Arc<KeyStore>>, name: String) -> AppResult<()> {
    key_store.delete_key(&name).await
}

#[tauri::command]
pub async fn list_supported_key_types() -> AppResult<Vec<KeyType>> {
    Ok(SUPPORTED_KEY_TYPES.to_vec())
}

#[tauri::command]
pub async fn get_key(key_store: State<'_, Arc<KeyStore>>, name: String) -> AppResult<String> {
    key_store.retrieve_key_pem(&name).await
}

// ─── SSH Session Commands ─────────────────────────────────────────────

#[tauri::command]
pub async fn ssh_connect(
    session_mgr: State<'_, Arc<SshSessionManager>>,
    host: String,
    port: u16,
    user: String,
    key_name: Option<String>,
    passphrase: Option<String>,
    password: Option<String>,
) -> AppResult<String> {
    log::info!("[SSH] Connecting to {}@{}:{}", user, host, port);
    let start = std::time::Instant::now();
    let result = if let Some(pw) = password {
        session_mgr
            .connect_with_password(&host, port, &user, &pw)
            .await
    } else if let Some(ref kn) = key_name {
        session_mgr
            .connect_with_key(&host, port, &user, kn, passphrase.as_deref())
            .await
    } else {
        Err(AppError::Ssh(
            "Either key_name or password must be provided".into(),
        ))
    };
    match &result {
        Ok(session_id) => log::info!(
            "[SSH] Connected in {:.2}ms — session_id={}",
            start.elapsed().as_secs_f64() * 1000.0,
            session_id,
        ),
        Err(e) => log::error!(
            "[SSH] Connection failed after {:.2}ms — {}",
            start.elapsed().as_secs_f64() * 1000.0,
            e,
        ),
    }
    result
}

#[tauri::command]
pub async fn ssh_test_connection(
    session_mgr: State<'_, Arc<SshSessionManager>>,
    host: String,
    port: u16,
    user: String,
    key_name: Option<String>,
    passphrase: Option<String>,
    password: Option<String>,
) -> AppResult<()> {
    log::info!("[SSH] Testing connection to {}@{}:{}", user, host, port);
    let start = std::time::Instant::now();
    let result = if let Some(pw) = password {
        session_mgr
            .test_connection_with_password(&host, port, &user, &pw)
            .await
    } else if let Some(ref kn) = key_name {
        session_mgr
            .test_connection_with_key(&host, port, &user, kn, passphrase.as_deref())
            .await
    } else {
        Err(AppError::Ssh(
            "Either key_name or password must be provided".into(),
        ))
    };
    match &result {
        Ok(()) => log::info!(
            "[SSH] Test connection succeeded in {:.2}ms",
            start.elapsed().as_secs_f64() * 1000.0,
        ),
        Err(e) => log::error!(
            "[SSH] Test connection failed after {:.2}ms — {}",
            start.elapsed().as_secs_f64() * 1000.0,
            e,
        ),
    }
    result
}

#[tauri::command]
pub async fn ssh_disconnect(
    session_mgr: State<'_, Arc<SshSessionManager>>,
    session_id: String,
) -> AppResult<()> {
    log::info!("[SSH] Disconnecting session_id={}", session_id);
    session_mgr.disconnect(&session_id).await
}

#[tauri::command]
pub async fn ssh_list_sessions(
    session_mgr: State<'_, Arc<SshSessionManager>>,
) -> AppResult<Vec<SessionInfo>> {
    let sessions = session_mgr.list_sessions().await;
    Ok(sessions
        .into_iter()
        .map(|(id, host, user)| SessionInfo { id, host, user })
        .collect())
}

// ─── SFTP Commands ────────────────────────────────────────────────────

#[tauri::command]
pub async fn sftp_list_dir(
    session_mgr: State<'_, Arc<SshSessionManager>>,
    session_id: String,
    path: String,
) -> AppResult<Vec<FileEntry>> {
    log::debug!("[CMD] sftp_list_dir called — path=\"{}\"", path);
    let start = std::time::Instant::now();

    let session = session_mgr.get_session(&session_id).await?;
    let session_lookup_ms = start.elapsed().as_secs_f64() * 1000.0;

    let result = sftp_ops::list_dir(&session, &path).await;

    log::info!(
        "[CMD] sftp_list_dir \"{}\" — total_cmd: {:.2}ms | session_lookup: {:.2}ms",
        path,
        start.elapsed().as_secs_f64() * 1000.0,
        session_lookup_ms,
    );
    result
}

#[tauri::command]
pub async fn sftp_read_file_preview(
    session_mgr: State<'_, Arc<SshSessionManager>>,
    session_id: String,
    path: String,
    max_bytes: Option<usize>,
) -> AppResult<FilePreview> {
    log::debug!("[CMD] sftp_read_file_preview called — path=\"{}\"", path);
    let start = std::time::Instant::now();
    let session = session_mgr.get_session(&session_id).await?;
    let result = sftp_ops::read_file_preview(&session, &path, max_bytes.unwrap_or(64 * 1024)).await;
    log::info!(
        "[CMD] sftp_read_file_preview \"{}\" — total_cmd: {:.2}ms",
        path,
        start.elapsed().as_secs_f64() * 1000.0,
    );
    result
}

#[tauri::command]
pub async fn sftp_download_file(
    session_mgr: State<'_, Arc<SshSessionManager>>,
    session_id: String,
    path: String,
) -> AppResult<Vec<u8>> {
    log::debug!("[CMD] sftp_download_file called — path=\"{}\"", path);
    let start = std::time::Instant::now();
    let session = session_mgr.get_session(&session_id).await?;
    let result = sftp_ops::download_file(&session, &path).await;
    log::info!(
        "[CMD] sftp_download_file \"{}\" — total_cmd: {:.2}ms",
        path,
        start.elapsed().as_secs_f64() * 1000.0,
    );
    result
}

#[tauri::command]
pub async fn sftp_save_file(
    app: tauri::AppHandle,
    session_mgr: State<'_, Arc<SshSessionManager>>,
    session_id: String,
    remote_path: String,
    file_name: String,
) -> AppResult<String> {
    let start = std::time::Instant::now();

    let save_dir = if cfg!(target_os = "android") {
        let public = std::path::PathBuf::from("/storage/emulated/0/Download");
        if public.exists()
            && std::fs::metadata(&public)
                .map(|m| !m.permissions().readonly())
                .unwrap_or(false)
        {
            public
        } else {
            app.path()
                .download_dir()
                .or_else(|_| app.path().app_data_dir())
                .map_err(|e| AppError::Sftp(format!("Cannot determine save directory: {e}")))?
        }
    } else {
        app.path()
            .download_dir()
            .or_else(|_| app.path().document_dir())
            .or_else(|_| app.path().app_data_dir())
            .map_err(|e| AppError::Sftp(format!("Cannot determine save directory: {e}")))?
    };

    std::fs::create_dir_all(&save_dir)
        .map_err(|e| AppError::Sftp(format!("Cannot create save directory: {e}")))?;

    let mut local_path = save_dir.join(&file_name);
    if local_path.exists() {
        let stem = local_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(&file_name)
            .to_string();
        let ext = local_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_string();
        let mut counter = 1u32;
        loop {
            let new_name = if ext.is_empty() {
                format!("{stem} ({counter})")
            } else {
                format!("{stem} ({counter}).{ext}")
            };
            local_path = save_dir.join(&new_name);
            if !local_path.exists() {
                break;
            }
            counter += 1;
        }
    }

    let local_str = local_path.to_string_lossy().to_string();
    log::debug!(
        "[CMD] sftp_save_file called — remote=\"{}\" local=\"{}\"",
        remote_path,
        local_str,
    );

    let session = session_mgr.get_session(&session_id).await?;
    sftp_ops::save_file(&session, &remote_path, &local_str).await?;

    log::info!(
        "[CMD] sftp_save_file \"{}\" -> \"{}\" — total_cmd: {:.2}ms",
        remote_path,
        local_str,
        start.elapsed().as_secs_f64() * 1000.0,
    );

    Ok(local_str)
}

#[tauri::command]
pub async fn sftp_create_dir(
    session_mgr: State<'_, Arc<SshSessionManager>>,
    session_id: String,
    path: String,
) -> AppResult<()> {
    log::debug!("[CMD] sftp_create_dir called — path=\"{}\"", path);
    let start = std::time::Instant::now();
    let session = session_mgr.get_session(&session_id).await?;
    let result = sftp_ops::create_dir(&session, &path).await;
    log::info!(
        "[CMD] sftp_create_dir \"{}\" — total_cmd: {:.2}ms",
        path,
        start.elapsed().as_secs_f64() * 1000.0,
    );
    result
}

#[tauri::command]
pub async fn sftp_upload_file(
    session_mgr: State<'_, Arc<SshSessionManager>>,
    session_id: String,
    remote_path: String,
    data: Vec<u8>,
) -> AppResult<()> {
    log::debug!("[CMD] sftp_upload_file called — path=\"{}\"", remote_path);
    let start = std::time::Instant::now();
    let session = session_mgr.get_session(&session_id).await?;
    let result = sftp_ops::upload_file(&session, &remote_path, &data).await;
    log::info!(
        "[CMD] sftp_upload_file \"{}\" — total_cmd: {:.2}ms",
        remote_path,
        start.elapsed().as_secs_f64() * 1000.0,
    );
    result
}

#[tauri::command]
pub async fn sftp_get_thumbnail(
    app: tauri::AppHandle,
    session_mgr: State<'_, Arc<SshSessionManager>>,
    session_id: String,
    path: String,
    max_bytes: Option<usize>,
    remote_mtime: Option<u64>,
) -> AppResult<String> {
    log::debug!("[CMD] sftp_get_thumbnail called — path=\"{}\"", path);

    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| AppError::Sftp(format!("Cannot determine cache dir: {e}")))?;
    let thumb_cache_dir = cache_dir.join("thumbnails");
    std::fs::create_dir_all(&thumb_cache_dir)
        .map_err(|e| AppError::Sftp(format!("Cannot create thumbnail cache dir: {e}")))?;

    let session = session_mgr.get_session(&session_id).await?;
    sftp_ops::get_thumbnail(
        &session,
        &path,
        max_bytes.unwrap_or(128 * 1024),
        &thumb_cache_dir,
        remote_mtime,
    )
    .await
}

#[tauri::command]
pub async fn sftp_cache_image(
    app: tauri::AppHandle,
    session_mgr: State<'_, Arc<SshSessionManager>>,
    session_id: String,
    path: String,
    remote_mtime: Option<u64>,
) -> AppResult<String> {
    log::debug!("[CMD] sftp_cache_image called — path=\"{}\"", path);
    let start = std::time::Instant::now();

    // Ensure the image cache directory exists.
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| AppError::Sftp(format!("Cannot determine cache dir: {e}")))?;
    let image_cache_dir = cache_dir.join("image_cache");
    std::fs::create_dir_all(&image_cache_dir)
        .map_err(|e| AppError::Sftp(format!("Cannot create image cache dir: {e}")))?;

    let session = session_mgr.get_session(&session_id).await?;
    let local_path = sftp_ops::cache_image(&session, &path, &image_cache_dir, remote_mtime).await?;

    log::info!(
        "[CMD] sftp_cache_image \"{}\" → \"{}\" — total_cmd: {:.2}ms",
        path,
        local_path,
        start.elapsed().as_secs_f64() * 1000.0,
    );
    Ok(local_path)
}

#[tauri::command]
pub async fn open_file_externally(path: String) -> AppResult<()> {
    log::info!("[CMD] open_file_externally — path=\"{}\"", path);
    tauri_plugin_opener::open_path(path, None::<&str>)
        .map_err(|e| AppError::Sftp(format!("Failed to open file externally: {e}")))
}

#[tauri::command]
pub async fn sftp_delete_file(
    session_mgr: State<'_, Arc<SshSessionManager>>,
    session_id: String,
    path: String,
) -> AppResult<()> {
    log::debug!("[CMD] sftp_delete_file called — path=\"{}\"", path);
    let start = std::time::Instant::now();
    let session = session_mgr.get_session(&session_id).await?;
    let result = sftp_ops::delete_file(&session, &path).await;
    log::info!(
        "[CMD] sftp_delete_file \"{}\" — total_cmd: {:.2}ms",
        path,
        start.elapsed().as_secs_f64() * 1000.0,
    );
    result
}

// ─── Helper types ─────────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct SessionInfo {
    pub id: String,
    pub host: String,
    pub user: String,
}
