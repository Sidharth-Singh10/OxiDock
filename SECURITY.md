# Security Checklist & Threat Model

## Key Storage

- [x] SSH private keys are stored base64-encoded in a JSON vault file in the app data directory
- [x] Raw PEM key material is NEVER sent to the JS frontend — `retrieve_key_pem()` is Rust-internal only
- [x] JS only receives safe metadata: key name, fingerprint, creation date
- [ ] **TODO**: Encrypt the vault file at rest using the Stronghold plugin or OS keychain on Android

## SSH Sessions

- [x] SSH sessions use `russh` (pure Rust, no C dependencies)
- [x] Key parsing happens exclusively in Rust via `russh::keys::PrivateKey`
- [x] Sessions are pooled and can be explicitly disconnected
- [ ] **TODO**: Implement host key verification (currently accepts all server keys — NOT safe for production)
- [ ] **TODO**: Add session TTL and automatic cleanup

## Memory Safety

- [x] Rust ownership model prevents key data leaks
- [ ] **TODO**: Use `zeroize` crate to explicitly zero key material after use
- [x] Private key data flows: JS (paste) → Rust (store) → Rust (retrieve for SSH) — never back to JS

## Logging

- [x] No private keys or passphrases are logged
- [x] Connection errors expose only host/user info, not key data

## Biometric Gating (Android)

- [ ] **TODO**: Integrate `tauri-plugin-biometric` for biometric check before key retrieval
- [ ] **TODO**: Implement passphrase fallback when biometrics not available

## Transport

- [x] All data transmitted over SSH (encrypted channel)
- [x] No remote backend required — direct client-to-VPS connection

## Threat Model

| Threat                             | Mitigation                          | Status   |
| ---------------------------------- | ----------------------------------- | -------- |
| Key theft from device storage      | Vault file in app-private directory | ✅ Basic |
| MITM attack (server impersonation) | Host key verification               | ❌ TODO  |
| Key extraction from memory         | Zeroize after use                   | ❌ TODO  |
| Unauthorized key access            | Biometric/passphrase gating         | ❌ TODO  |
| Key exposure to JS context         | Rust-only key retrieval             | ✅ Done  |
| Log leakage                        | Safe logging (no secrets)           | ✅ Done  |
