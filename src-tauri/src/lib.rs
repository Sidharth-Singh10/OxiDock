mod commands;
mod errors;
mod key_store;
mod sftp_ops;
mod ssh_manager;

use std::sync::Arc;
use tauri::Manager;

use key_store::KeyStore;
use ssh_manager::SshSessionManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("oxidock=debug"))
        .format_timestamp_millis()
        .init();

    log::info!("OxiDock starting — performance logging enabled");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");
            std::fs::create_dir_all(&app_dir).ok();

            let vault_path = app_dir.join("ssh_keys.json");
            let key_store = Arc::new(KeyStore::new(vault_path));
            let session_mgr = Arc::new(SshSessionManager::new(key_store.clone()));

            app.manage(key_store);
            app.manage(session_mgr);

            #[cfg(mobile)]
            app.handle().plugin(tauri_plugin_biometric::init())?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::store_key,
            commands::list_keys,
            commands::delete_key,
            commands::get_key,
            commands::list_supported_key_types,
            commands::ssh_connect,
            commands::ssh_disconnect,
            commands::ssh_list_sessions,
            commands::sftp_list_dir,
            commands::sftp_read_file_preview,
            commands::sftp_download_file,
            commands::sftp_save_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
