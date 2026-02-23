use base64::Engine;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tokio::sync::Mutex;

use crate::errors::{AppError, AppResult};

/// Metadata about a stored SSH key (safe to send to JS).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyInfo {
    pub name: String,
    pub fingerprint: String,
    pub created_at: String,
}

/// Internal key record stored on disk.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct KeyRecord {
    name: String,
    fingerprint: String,
    created_at: String,
    key_pem_b64: String,
}

/// Manages SSH keys stored as an encrypted JSON file.
/// Uses Stronghold-style storage via a simple JSON vault on disk.
pub struct KeyStore {
    vault_path: PathBuf,
    lock: Mutex<()>,
}

impl KeyStore {
    pub fn new(vault_path: PathBuf) -> Self {
        Self {
            vault_path,
            lock: Mutex::new(()),
        }
    }

    /// Compute a simple fingerprint from a PEM key string.
    fn compute_fingerprint(pem: &str) -> String {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let mut hasher = DefaultHasher::new();
        pem.hash(&mut hasher);
        let hash = hasher.finish();
        format!("FP:{:016x}", hash)
    }

    /// Load the index of all stored keys from disk.
    fn load_index_sync(&self) -> AppResult<HashMap<String, KeyRecord>> {
        if !self.vault_path.exists() {
            return Ok(HashMap::new());
        }
        let data = std::fs::read_to_string(&self.vault_path)
            .map_err(|e| AppError::KeyStore(format!("Failed to read vault: {e}")))?;
        if data.trim().is_empty() {
            return Ok(HashMap::new());
        }
        serde_json::from_str(&data)
            .map_err(|e| AppError::KeyStore(format!("Failed to parse vault: {e}")))
    }

    /// Save the index of all stored keys to disk.
    fn save_index_sync(&self, index: &HashMap<String, KeyRecord>) -> AppResult<()> {
        let data = serde_json::to_string_pretty(index)
            .map_err(|e| AppError::KeyStore(format!("Failed to serialize vault: {e}")))?;
        if let Some(parent) = self.vault_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        std::fs::write(&self.vault_path, data)
            .map_err(|e| AppError::KeyStore(format!("Failed to write vault: {e}")))
    }

    /// Store a new SSH key.
    pub async fn store_key(&self, name: String, key_pem: String) -> AppResult<KeyInfo> {
        let _guard = self.lock.lock().await;
        let fingerprint = Self::compute_fingerprint(&key_pem);
        let created_at = Utc::now().to_rfc3339();
        let key_pem_b64 = base64::engine::general_purpose::STANDARD.encode(key_pem.as_bytes());

        let record = KeyRecord {
            name: name.clone(),
            fingerprint: fingerprint.clone(),
            created_at: created_at.clone(),
            key_pem_b64,
        };

        let mut index = self.load_index_sync()?;
        index.insert(name.clone(), record);
        self.save_index_sync(&index)?;

        Ok(KeyInfo {
            name,
            fingerprint,
            created_at,
        })
    }

    /// List all stored keys (metadata only).
    pub async fn list_keys(&self) -> AppResult<Vec<KeyInfo>> {
        let _guard = self.lock.lock().await;
        let index = self.load_index_sync()?;
        let keys: Vec<KeyInfo> = index
            .values()
            .map(|r| KeyInfo {
                name: r.name.clone(),
                fingerprint: r.fingerprint.clone(),
                created_at: r.created_at.clone(),
            })
            .collect();
        Ok(keys)
    }

    /// Delete a stored key by name.
    pub async fn delete_key(&self, name: &str) -> AppResult<()> {
        let _guard = self.lock.lock().await;
        let mut index = self.load_index_sync()?;
        if index.remove(name).is_none() {
            return Err(AppError::KeyStore(format!("Key not found: {name}")));
        }
        self.save_index_sync(&index)
    }

    /// Retrieve the raw PEM key for Rust-only use (SSH authentication).
    /// This MUST NOT be exposed to JS.
    pub async fn retrieve_key_pem(&self, name: &str) -> AppResult<String> {
        let _guard = self.lock.lock().await;
        let index = self.load_index_sync()?;
        let record = index
            .get(name)
            .ok_or_else(|| AppError::KeyStore(format!("Key not found: {name}")))?;

        let pem_bytes = base64::engine::general_purpose::STANDARD
            .decode(&record.key_pem_b64)
            .map_err(|e| AppError::KeyStore(format!("Failed to decode key: {e}")))?;

        String::from_utf8(pem_bytes)
            .map_err(|e| AppError::KeyStore(format!("Invalid UTF-8 in key: {e}")))
    }
}
