# OxiDock — VPS File Browser

A cross-platform Tauri 2 mobile app for browsing remote VPS servers over SSH/SFTP. Built with **Rust** (native layer) and **React + Joy UI** (frontend).

## Architecture

```
React + Joy UI (frontend)
  └─ communicates with Rust via Tauri invoke() calls

Tauri (Rust) layer
  ├─ key_store.rs     — SSH key storage (JSON vault, base64-encoded)
  ├─ ssh_manager.rs   — SSH session manager (russh 0.57, async)
  ├─ sftp_ops.rs      — SFTP operations (list, preview, download)
  ├─ commands.rs      — Tauri command wrappers exposed to JS
  └─ errors.rs        — Unified error types
```

## Features

- **SSH Key Management**: Paste and store SSH private keys securely. Keys are base64-encoded and stored in a JSON vault. Raw key material never reaches the JS layer.
- **Server Management**: Add, remove, and connect to SSH servers. Server configs are stored in localStorage.
- **File Browsing**: Navigate remote directories with breadcrumb navigation and a sortable file table.
- **File Preview**: Preview text files with monospace rendering and images with base64 rendering.
- **Session Pooling**: Multiple SSH sessions managed concurrently.

## Prerequisites

- **Rust** ≥ 1.77.2 (`rustup` recommended)
- **Deno** (runtime for frontend dev)
- **Node.js** ≥ 18 (for npm packages via Deno)
- **Tauri CLI**: `cargo install tauri-cli`

### For Android builds:

- Android SDK with API level ≥ 28
- Android NDK
- Java JDK 17+
- `cargo install tauri-cli --features mobile`

## Local Development

```bash
# Install JS dependencies
deno install --allow-scripts

# Run in development mode (desktop)
cargo tauri dev

# TypeScript check
npx tsc --noEmit

# Rust check
cd src-tauri && cargo check
```

## Android Build

```bash
# Initialize Android project (first time only)
cargo tauri android init

# Run on connected device or emulator
cargo tauri android dev

# Build release APK
cargo tauri android build
```

The APK will be generated at:
`src-tauri/gen/android/app/build/outputs/apk/release/app-release.apk`

## Adding Hosts & Keys

1. Open the app and go to the **Keys** tab
2. Paste your SSH private key (OpenSSH PEM format) and give it a name
3. Switch to the **Servers** tab and click **+ Add Server**
4. Fill in: display name, host, port (default 22), username, and select an SSH key
5. Click the server card or **Connect** button to browse files

## Project Structure

```
OxiDock/
├── src/                          # React frontend
│   ├── components/
│   │   ├── KeyManager.tsx        # SSH key management UI
│   │   ├── ServerList.tsx        # Server list + add modal
│   │   ├── FileBrowser.tsx       # Directory listing + navigation
│   │   └── FilePreview.tsx       # Text/image file preview
│   ├── lib/
│   │   ├── types.ts              # TypeScript interfaces
│   │   └── storage.ts            # localStorage helpers
│   ├── theme.ts                  # Joy UI dark theme
│   ├── App.tsx                   # Main app with tabs
│   ├── main.tsx                  # Root entry point
│   └── App.css                   # Global styles
├── src-tauri/                    # Rust native layer
│   ├── src/
│   │   ├── lib.rs                # Tauri app setup & plugin registration
│   │   ├── commands.rs           # Tauri command handlers
│   │   ├── key_store.rs          # SSH key vault
│   │   ├── ssh_manager.rs        # SSH session manager
│   │   ├── sftp_ops.rs           # SFTP operations
│   │   └── errors.rs             # Error types
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json
└── vite.config.ts
```

## Plugin Notes

| Plugin/Crate | Version       | Purpose                      |
| ------------ | ------------- | ---------------------------- |
| `russh`      | 0.57          | Pure Rust async SSH client   |
| `russh-sftp` | 2.1           | SFTP subsystem for russh     |
| `@mui/joy`   | 5.0.0-beta.52 | Joy UI component library     |
| `tauri`      | 2.x           | Desktop/mobile app framework |

## License

MIT
