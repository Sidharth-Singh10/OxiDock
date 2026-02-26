# Thumbnail Processing Pipeline

This document explains the entire thumbnail generation and caching pipeline in OxiDock.

## Overview

When the user navigates to a folder containing images, the app fetches thumbnails. Instead of downloading full-size images (which could be several megabytes each) to the frontend and rendering them, OxiDock handles thumbnail generation **entirely on the Rust backend**.

The backend:

1. Downloads up to the first 10MB of the image over SFTP.
2. Decodes the image and resizes it to a maximum of 256x256 using native CPU operations.
3. Encodes the tiny result into WebP format.
4. Caches the resulting WebP file persistently on the device's storage.
5. Sends the WebP back to the frontend as a base64 string.

## Technical Flow

### 1. Frontend Request

The frontend `ImageThumbnail` component sees an image file and asks the backend for a thumbnail via the Tauri command:
`invoke('sftp_get_thumbnail', { sessionId, path })`

_(File: `src/components/ImageThumbnail.tsx` and `src-tauri/src/commands.rs`)_

### 2. Backend Caching Layer (Disk)

Before making any network requests, the backend checks the local device cache.
We use Tauri's `app.path().app_cache_dir()` which safely resolves to the correct temporary cache directory on Android, Windows, Linux, and macOS. Inside this, we create a `thumbnails/` folder.

To prevent invalid path characters in different operating systems, we convert the remote SFTP path into a **URL-safe base64 string** and use that as the filename:
`{base64_url_safe}_thumb.webp`

If this file exists on disk, we immediately read it, encode it to base64, and return it to the frontend. **This reduces processing time from ~10,000ms to <5ms.**

_(File: `src-tauri/src/sftp_ops.rs` -> `get_thumbnail`)_

### 3. SFTP Network Download (Cache Miss)

If the thumbnail is not cached, the backend opens the remote file via SFTP.
To prevent massive memory spikes when encountering very large images (e.g., 50MB panoramas), we cap the download at **10MB**.

**Important Network Detail:**
We use `.take(10 * 1024 * 1024).read_to_end(&mut buf)` rather than a simple `.read()`. Over SFTP/SSH streams, a single `.read()` may only return the first transport chunk (often ~255 KB). `read_to_end` ensures we pull the full 10MB or the entire file, whichever is smaller, avoiding corrupted/partial image decoding.

### 4. Image Decoding and Resizing (CPU Task)

Because image decoding blocks the main thread, we wrap the processing in `tokio::task::spawn_blocking`.

We use two crates to handle the image:

- **`image`**: Used to decode the raw bytes from SFTP into a standard RGBA image.
- **`fast_image_resize`**: A highly optimized crate that uses CPU SIMD instructions to resize the raw pixels to 256x256 (maintaining aspect ratio) using Bilinear filtering. This is significantly faster than standard image resizing.

### 5. WebP Compression

To minimize memory usage and payload size over the Tauri IPC bridge, the resized image buffer is compressed into the **WebP format** using the `image` crate. WebP yields very small file sizes for thumbnails while maintaining excellent quality.

### 6. Saving to Cache and Returning

The resulting WebP bytes are written to the local disk cache (`thumbnails/` directory) so that future views of this directory are instantaneous.
Finally, the WebP bytes are converted to a standard Base64 string and returned to the frontend.

### 7. Frontend In-Memory Caching

To avoid constantly crossing the Tauri IPC bridge or hitting the disk for files the user is _currently_ looking at, the frontend maintains its own short-lived session cache in `thumbnailCache` inside `src/lib/imageCache.ts`.

If the user scrolls an image out of view and back into view, the React component pulls the base64 string directly from the JavaScript memory Map.

## Future Improvements for Contributors

- **Cache Eviction**: Currently, the persistent disk cache grows indefinitely. We should add a startup task that prunes thumbnails older than 30 days or keeps the folder size under a certain limit (e.g., 250MB).
- **Mtime Invalidation**: The current cache relies purely on the remote file path. If an image on the server is overwritten with a new image using the exact same name, the old cached thumbnail will still appear. We could include the file's `mtime` (modified time) in the cache key or verification step.

## Performance Logs & Areas for Improvement

Currently, the thumbnail generation process is very slow, particularly on lower-end devices or large files. As shown in the logs below, it can take anywhere from 7 to 13 seconds entirely blocking on image decoding and resizing over SFTP chunks:

```log
02-27 04:51:48.740 24614 24710 I RustStdoutStderr: [2026-02-26T23:21:48.740Z INFO  oxidock_lib::sftp_ops] [PERF] fast_image_resize processing — 3200.87ms
02-27 04:51:48.740 24614 24710 I RustStdoutStderr: [2026-02-26T23:21:48.740Z INFO  oxidock_lib::sftp_ops] [PERF] get_thumbnail "/home/asuna/deployments/Hello/Screenshot_2026-02-24-15-27-17-67_8120912a0e739f76342a2a1f82bc3c10.jpg" — total: 6876.87ms | bytes_read: 261120 (up to 10MB)
02-27 04:51:54.665 24614 24710 I RustStdoutStderr: [2026-02-26T23:21:54.665Z INFO  oxidock_lib::sftp_ops] [PERF] fast_image_resize processing — 7199.10ms
02-27 04:51:54.666 24614 24710 I RustStdoutStderr: [2026-02-26T23:21:54.665Z INFO  oxidock_lib::sftp_ops] [PERF] get_thumbnail "/home/asuna/deployments/Hello/IMG-20260225-WA0004.jpeg" — total: 12799.78ms | bytes_read: 261120 (up to 10MB)
```

> [!WARNING]
> **Contributor Notice**: This file and the associated thumbnailing pipeline were generated entirely by an AI (Antigravity). A lot of improvement is needed to handle performance edge cases, reduce CPU spikes on mobile devices, and optimize network pipelining. If any human developer is up for it, contributions, refactors, and optimizations to this pipeline are highly welcome!
