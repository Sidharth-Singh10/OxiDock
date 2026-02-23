use std::collections::HashMap;
use std::net::ToSocketAddrs;
use std::sync::Arc;
use tokio::sync::{Mutex, OnceCell};
use uuid::Uuid;

use russh::client;
use russh::keys::key::PrivateKeyWithHashAlg;
use russh::keys::PrivateKey;
use russh_sftp::client::SftpSession;

use crate::errors::{AppError, AppResult};
use crate::key_store::KeyStore;

/// Client handler for russh — accepts all server host keys.
pub(crate) struct ClientHandler;

impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh::keys::PublicKey,
    ) -> Result<bool, Self::Error> {
        // Accept all host keys for now.
        // TODO: implement known-hosts verification for production.
        Ok(true)
    }
}

/// Holds an active SSH session handle with a pooled SFTP channel.
pub struct SshSession {
    handle: client::Handle<ClientHandler>,
    pub(crate) host: String,
    pub(crate) user: String,
    sftp: OnceCell<SftpSession>,
}

impl SshSession {
    /// Returns a reusable SFTP session, creating one on first call.
    pub(crate) async fn sftp(&self) -> AppResult<&SftpSession> {
        let already_initialized = self.sftp.initialized();
        if already_initialized {
            log::debug!(
                "[SFTP] Reusing existing SFTP channel (host={}, user={})",
                self.host,
                self.user,
            );
        }

        let result = self
            .sftp
            .get_or_try_init(|| async {
                log::info!(
                    "[SFTP] Creating NEW SFTP channel (host={}, user={})",
                    self.host,
                    self.user,
                );
                let start = std::time::Instant::now();

                let channel = self
                    .handle
                    .channel_open_session()
                    .await
                    .map_err(|e| AppError::Sftp(format!("Failed to open channel: {e}")))?;

                channel
                    .request_subsystem(true, "sftp")
                    .await
                    .map_err(|e| {
                        AppError::Sftp(format!("Failed to request sftp subsystem: {e}"))
                    })?;

                let session = SftpSession::new(channel.into_stream())
                    .await
                    .map_err(|e| AppError::Sftp(format!("Failed to init SFTP session: {e}")))?;

                log::info!(
                    "[SFTP] New channel created in {:.2}ms",
                    start.elapsed().as_secs_f64() * 1000.0,
                );
                Ok(session)
            })
            .await;

        result
    }
}

/// Manages active SSH sessions with pooling.
pub struct SshSessionManager {
    sessions: Arc<Mutex<HashMap<String, Arc<SshSession>>>>,
    key_store: Arc<KeyStore>,
}

impl SshSessionManager {
    pub fn new(key_store: Arc<KeyStore>) -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            key_store,
        }
    }

    /// Connect to an SSH server using a stored key.
    pub async fn connect(
        &self,
        host: &str,
        port: u16,
        user: &str,
        key_name: &str,
        passphrase: Option<&str>,
    ) -> AppResult<String> {
        // Retrieve key PEM from vault
        let pem = self.key_store.retrieve_key_pem(key_name).await?;

        // Parse the private key using russh's re-exported ssh-key crate
        let private_key = if let Some(pass) = passphrase {
            PrivateKey::from_openssh(pem.as_bytes())
                .and_then(|k| k.decrypt(pass))
                .map_err(|e| AppError::Ssh(format!("Failed to decode key: {e}")))?
        } else {
            PrivateKey::from_openssh(pem.as_bytes())
                .map_err(|e| AppError::Ssh(format!("Failed to decode key: {e}")))?
        };

        // Resolve address
        let addr = format!("{host}:{port}")
            .to_socket_addrs()
            .map_err(|e| AppError::Ssh(format!("Failed to resolve host: {e}")))?
            .next()
            .ok_or_else(|| AppError::Ssh("Could not resolve host address".into()))?;

        // Build SSH config
        let config = Arc::new(client::Config::default());

        // Connect
        let mut handle = client::connect(config, addr, ClientHandler)
            .await
            .map_err(|e| AppError::Ssh(format!("Connection failed: {e}")))?;

        // Get best RSA hash algorithm
        let hash_alg = handle
            .best_supported_rsa_hash()
            .await
            .ok()
            .flatten()
            .flatten();

        // Wrap the key with hash algorithm for authentication
        let key_with_hash = PrivateKeyWithHashAlg::new(Arc::new(private_key), hash_alg);

        // Authenticate
        let auth_result = handle
            .authenticate_publickey(user, key_with_hash)
            .await
            .map_err(|e| AppError::Ssh(format!("Auth failed: {e}")))?;

        if !auth_result.success() {
            return Err(AppError::Ssh("Authentication rejected by server".into()));
        }

        let session_id = Uuid::new_v4().to_string();
        let session = Arc::new(SshSession {
            handle,
            host: host.to_string(),
            user: user.to_string(),
            sftp: OnceCell::new(),
        });

        let mut sessions = self.sessions.lock().await;
        sessions.insert(session_id.clone(), session);

        Ok(session_id)
    }

    /// Get an active session by ID.
    pub async fn get_session(&self, session_id: &str) -> AppResult<Arc<SshSession>> {
        let sessions = self.sessions.lock().await;
        sessions
            .get(session_id)
            .cloned()
            .ok_or_else(|| AppError::SessionNotFound(session_id.to_string()))
    }

    /// Disconnect and remove a session.
    pub async fn disconnect(&self, session_id: &str) -> AppResult<()> {
        let mut sessions = self.sessions.lock().await;
        if sessions.remove(session_id).is_some() {
            Ok(())
        } else {
            Err(AppError::SessionNotFound(session_id.to_string()))
        }
    }

    /// List active session IDs with metadata.
    pub async fn list_sessions(&self) -> Vec<(String, String, String)> {
        let sessions = self.sessions.lock().await;
        sessions
            .iter()
            .map(|(id, s)| (id.clone(), s.host.clone(), s.user.clone()))
            .collect()
    }
}
