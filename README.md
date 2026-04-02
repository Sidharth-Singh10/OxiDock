# OxiDock — VPS File Browser

A cross-platform Tauri 2 desktop/mobile app for browsing remote VPS servers over SSH/SFTP. Built with **Rust** (native layer) and **React + MUI Material** (frontend).

## Architecture

```
React + MUI Material (frontend)
  └─ communicates with Rust via Tauri invoke() calls

Tauri (Rust) layer
  ├─ key_store.rs     — SSH key vault (JSON file, base64-encoded)
  ├─ ssh_manager.rs   — SSH session manager (russh 0.57, async, session pooling)
  ├─ sftp_ops.rs      — SFTP operations (list, preview, download, upload, delete,
  │                      image caching)
  ├─ commands.rs      — Tauri command wrappers exposed to JS
  └─ errors.rs        — Unified error types
```

## Features

### SSH & Server Management
- **SSH Key Management**: Store SSH private keys securely. Keys are base64-encoded and persisted in a JSON vault. Supports PEM, RSA, ECDSA, Ed25519, and OpenSSH key formats with automatic type detection.
- **Biometric Protection** (mobile): Adding new keys requires biometric authentication on supported devices.
- **Server Profiles**: Add, remove, and connect to SSH servers. Configure a **default server** and **default mount path** for auto-connect on launch.
- **Test Connection**: Verify server connectivity before saving.
- **Password & Key Auth**: Connect using stored SSH keys (with optional passphrase) or plain password authentication.
- **Session Pooling**: Multiple SSH sessions managed concurrently with lazy SFTP channel creation.

### File Browsing
- **Directory Navigation**: Browse remote directories with breadcrumb navigation.
- **View Modes**: Switch between list, grid, and compact layouts with adjustable zoom.
- **Sorting**: Sort files by name, size, or modification date.
- **Folder Options**: Toggle hidden files, folders-first ordering, remember last visited path, and folder size labels.
- **Directory Caching**: In-memory directory cache with prefetching of child directories for snappy navigation.
- **Context Menu**: Long-press on files/folders for quick actions (open, preview, download, delete).

### File Operations
- **File Preview**: Preview text files with monospace rendering and binary/image files with base64 rendering.
- **File Upload**: Upload local files to the remote server.
- **Folder Creation**: Create new directories on the remote server.
- **File Download**: Download files with collision-safe filenames. Android targets `/storage/emulated/0/Download` when writable.
- **File & Directory Deletion**: Delete files or recursively delete entire directories.

### Image Handling
- **Image Viewer**: Full-screen image viewer with pan/zoom gestures and swipe navigation. Full images cached locally (~200 MB) and read via the Tauri FS plugin.

### UI & Theming
- **Theme System**: Multiple built-in themes — Tokyo Night and Catppuccin variants — selectable from a theme picker in the navigation drawer.
- **Glass-style Bottom Dock**: Frosted-glass navigation bar (Browse / Keys) when disconnected.
- **Swipeable Drawer**: Slide-out navigation drawer with server list, key management, and theme selection.
- **Android Back Gesture**: Contextual back handling — closes drawer, collapses theme picker, navigates up in file browser, disconnects, or exits app (double-back).

## Prerequisites

- **Rust** >= 1.77.2 (`rustup` recommended)
- **Deno** (runtime for frontend dev)
- **Node.js** >= 18 (for npm packages via Deno)
- **Tauri CLI**: `cargo install tauri-cli`

### For Android builds:

- Android SDK with API level >= 28
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

1. Open the app and tap the hamburger menu (or swipe right) to open the drawer
2. Go to **Keys** and paste your SSH private key (OpenSSH PEM format), giving it a name
3. Switch to **Servers** and tap **+ Add Server**
4. Fill in: display name, host, port (default 22), username, and select an SSH key or use password auth
5. Optionally mark a server as **default** and set a **default mount path**
6. Tap **Test Connection** to verify, then save
7. Tap a server card to connect and browse files

## Project Structure

```
OxiDock/
├── src/                              # React frontend
│   ├── components/
│   │   ├── FileBrowser.tsx           # Directory listing, navigation, FAB, context menu
│   │   ├── ServerList.tsx            # Server list + add/edit modal
│   │   ├── KeyManager.tsx            # SSH key management UI
│   │   ├── FilePreview.tsx           # Text/binary file preview + download
│   │   ├── ImageViewer.tsx           # Full-screen image viewer (pan/zoom/swipe)
│   │   ├── ViewOptionsPopover.tsx    # View mode, sort, and zoom controls
│   │   └── FolderOptionsPopover.tsx  # Hidden files, folders-first, path memory
│   ├── lib/
│   │   ├── types.ts                  # TypeScript interfaces
│   │   ├── storage.ts                # localStorage helpers (servers, preferences)
│   │   ├── dirCache.ts               # In-memory directory cache + prefetch
│   │   ├── imageCache.ts             # Full-image cache helpers
│   │   └── useBiometric.ts           # Biometric auth hook (mobile)
│   ├── theme/
│   │   ├── index.ts                  # Theme exports
│   │   ├── ThemeContext.tsx           # Theme provider + picker logic
│   │   ├── tokyonight.ts             # Tokyo Night theme
│   │   └── catppuccin.ts             # Catppuccin theme
│   ├── App.tsx                       # Main app shell (drawer, dock, auto-connect)
│   ├── main.tsx                      # Root entry point
│   └── App.css                       # Global styles
├── src-tauri/                        # Rust native layer
│   ├── src/
│   │   ├── main.rs                   # Binary entry point
│   │   ├── lib.rs                    # Tauri plugin init & invoke handler registration
│   │   ├── commands.rs               # Tauri command handlers
│   │   ├── key_store.rs              # SSH key vault (JSON, base64)
│   │   ├── ssh_manager.rs            # SSH session manager (russh)
│   │   ├── sftp_ops.rs               # SFTP ops + image caching pipeline
│   │   └── errors.rs                 # Error types
│   ├── capabilities/
│   │   ├── default.json              # Desktop capabilities (core, opener, dialog, fs, process)
│   │   └── mobile.json               # Mobile capabilities (biometric, back-pressed)
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json
└── vite.config.ts
```

## License

MIT
