use std::sync::Arc;
use tauri::State;

use crate::errors::AppResult;
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
    key_name: String,
    passphrase: Option<String>,
) -> AppResult<String> {
    log::info!("[SSH] Connecting to {}@{}:{}", user, host, port);
    let start = std::time::Instant::now();
    let result = session_mgr
        .connect(&host, port, &user, &key_name, passphrase.as_deref())
        .await;
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

// ─── Helper types ─────────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct SessionInfo {
    pub id: String,
    pub host: String,
    pub user: String,
}
