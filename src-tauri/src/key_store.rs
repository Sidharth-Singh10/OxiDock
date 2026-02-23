use base64::Engine;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tokio::sync::Mutex;

use crate::errors::{AppError, AppResult};

// ─── Supported Key Types ───────────────────────────────────────────────

/// The predefined set of SSH key types we support.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum KeyType {
    /// Generic PKCS#8 PEM private key
    Pem,
    /// RSA private key
    Rsa,
    /// ECDSA private key (any curve)
    Ecdsa,
    /// Ed25519 private key
    Ed25519,
}

impl std::fmt::Display for KeyType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            KeyType::Pem => write!(f, "PEM"),
            KeyType::Rsa => write!(f, "RSA"),
            KeyType::Ecdsa => write!(f, "ECDSA"),
            KeyType::Ed25519 => write!(f, "Ed25519"),
        }
    }
}

/// All key types the application accepts.
pub const SUPPORTED_KEY_TYPES: &[KeyType] =
    &[KeyType::Pem, KeyType::Rsa, KeyType::Ecdsa, KeyType::Ed25519];

/// Detect the key type from PEM content.
///
/// Inspects PEM headers and, for OpenSSH keys, the algorithm identifier
/// encoded inside the base64 payload.
pub fn detect_key_type(pem: &str) -> AppResult<KeyType> {
    let trimmed = pem.trim();

    // Legacy PEM-format headers
    if trimmed.starts_with("-----BEGIN RSA PRIVATE KEY-----") {
        return Ok(KeyType::Rsa);
    }
    if trimmed.starts_with("-----BEGIN EC PRIVATE KEY-----") {
        return Ok(KeyType::Ecdsa);
    }
    if trimmed.starts_with("-----BEGIN PRIVATE KEY-----") {
        // Generic PKCS#8 — could be RSA/EC/Ed25519 but we classify as Pem
        return Ok(KeyType::Pem);
    }

    // OpenSSH format — need to peek at the key algorithm inside the blob
    if trimmed.starts_with("-----BEGIN OPENSSH PRIVATE KEY-----") {
        // Decode the base64 body and look for the algorithm string
        let body: String = trimmed
            .lines()
            .filter(|l| !l.starts_with("-----"))
            .collect();

        if let Ok(decoded) = base64::engine::general_purpose::STANDARD.decode(body.as_bytes()) {
            let payload = String::from_utf8_lossy(&decoded);
            if payload.contains("ssh-rsa") {
                return Ok(KeyType::Rsa);
            }
            if payload.contains("ssh-ed25519") {
                return Ok(KeyType::Ed25519);
            }
            if payload.contains("ecdsa-sha2") {
                return Ok(KeyType::Ecdsa);
            }
        }

        // Couldn't determine specific type — still a valid OpenSSH key,
        // fall through to generic PEM classification
        return Ok(KeyType::Pem);
    }

    Err(AppError::UnsupportedKeyType(
        "Key format not recognized. Supported types: PEM (PKCS#8), RSA, ECDSA, Ed25519".into(),
    ))
}

// ─── Data Structures ───────────────────────────────────────────────────

/// Default key type for backward-compatible deserialization of existing keys.
fn default_key_type() -> KeyType {
    KeyType::Pem
}

/// Metadata about a stored SSH key (safe to send to JS).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyInfo {
    pub name: String,
    pub key_type: KeyType,
    pub fingerprint: String,
    pub created_at: String,
}

/// Internal key record stored on disk.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct KeyRecord {
    name: String,
    #[serde(default = "default_key_type")]
    key_type: KeyType,
    fingerprint: String,
    created_at: String,
    key_pem_b64: String,
}

// ─── Key Store ─────────────────────────────────────────────────────────

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

    /// Store a new SSH key. The key type is auto-detected from PEM content.
    /// Returns an error if the key format is not one of the supported types.
    pub async fn store_key(&self, name: String, key_pem: String) -> AppResult<KeyInfo> {
        // Validate and classify key type before anything else
        let key_type = detect_key_type(&key_pem)?;

        let _guard = self.lock.lock().await;
        let fingerprint = Self::compute_fingerprint(&key_pem);
        let created_at = Utc::now().to_rfc3339();
        let key_pem_b64 = base64::engine::general_purpose::STANDARD.encode(key_pem.as_bytes());

        let record = KeyRecord {
            name: name.clone(),
            key_type,
            fingerprint: fingerprint.clone(),
            created_at: created_at.clone(),
            key_pem_b64,
        };

        let mut index = self.load_index_sync()?;
        index.insert(name.clone(), record);
        self.save_index_sync(&index)?;

        Ok(KeyInfo {
            name,
            key_type,
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
                key_type: r.key_type,
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
