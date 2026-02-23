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
    session_mgr
        .connect(&host, port, &user, &key_name, passphrase.as_deref())
        .await
}

#[tauri::command]
pub async fn ssh_disconnect(
    session_mgr: State<'_, Arc<SshSessionManager>>,
    session_id: String,
) -> AppResult<()> {
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
    let session = session_mgr.get_session(&session_id).await?;
    sftp_ops::list_dir(&session, &path).await
}

#[tauri::command]
pub async fn sftp_read_file_preview(
    session_mgr: State<'_, Arc<SshSessionManager>>,
    session_id: String,
    path: String,
    max_bytes: Option<usize>,
) -> AppResult<FilePreview> {
    let session = session_mgr.get_session(&session_id).await?;
    sftp_ops::read_file_preview(&session, &path, max_bytes.unwrap_or(64 * 1024)).await
}

#[tauri::command]
pub async fn sftp_download_file(
    session_mgr: State<'_, Arc<SshSessionManager>>,
    session_id: String,
    path: String,
) -> AppResult<Vec<u8>> {
    let session = session_mgr.get_session(&session_id).await?;
    sftp_ops::download_file(&session, &path).await
}

// ─── Helper types ─────────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct SessionInfo {
    pub id: String,
    pub host: String,
    pub user: String,
}
