# Performance

Tracked improvements for SFTP file browsing and overall app responsiveness.
Every change here should be justified by a measurement; see the ledger at the
bottom for before/after numbers and reverted attempts.

## Baseline (measured)

**Frontend shell** — production build, headless Chromium, desktop (1280×800):

| Metric | Value |
| --- | --- |
| First contentful paint | 132 ms |
| DOMContentLoaded / load | 43 ms |
| Script time at load | 47 ms (Task 109 ms, Layout 36 ms) |
| Long tasks > 50 ms | 1 (69 ms, React mount) |
| Heap after load | 4.0 MB · 207 DOM nodes |
| Interactions (drawer, theme switch, tab switch ×2) | Script 71 ms · no long tasks · heap +3.4 MB |
| Bundle | 583 KB JS (179 KB gzip) · 6.6 KB CSS |

**Data paths (SFTP)** — capture against a real VPS before/after each change:
preview a large file (`[PERF] read_file_preview`), upload and download a
~100 MB file (`[CMD] sftp_upload_chunk` / `[PERF] save_file`), and open your
largest directories (`[PERF] list_dir … entries: N`).

## Backend (Rust / SFTP)

- [x] **Reuse SFTP sessions** — pool `SftpSession` inside `SshSession` via
      `tokio::sync::OnceCell`.
      _Files: `ssh_manager.rs`, `sftp_ops.rs`_

- [x] **Range-read for file previews** — `read_file_preview` now stats the file
      and reads only the preview window via a bounded `open()` read; the rest
      of the file is never transferred. Truncation is derived from metadata.
      _File: `sftp_ops.rs` — `read_file_preview()`_

- [x] **Streaming transfers** — `save_file` and `cache_image` stream in 128 KB
      chunks instead of buffering the whole file in RAM; uploads travel as
      4 MB raw-body chunks (see below). Memory stays flat for large files.
      _Files: `sftp_ops.rs` — `save_file()`, `cache_image()`, `upload_chunk()`_

- [x] **Raw-body chunked uploads** — uploads used to serialize the whole file
      as a JSON number array (`Array.from(new Uint8Array(...))`). Chunks now
      travel as the raw invoke body (`InvokeBody::Raw`) with metadata in
      request headers, written at their offset. Progress is reported per chunk.
      _Files: `commands.rs` — `sftp_upload_chunk()`, `FileBrowser.tsx`_

- [x] **Raw timestamps** — `FileEntry.modified` is now epoch milliseconds;
      no per-entry `chrono` conversion or RFC3339 string allocation.
      _Files: `sftp_ops.rs`, `lib/types.ts`, `FileBrowser.tsx`, `ImageViewer.tsx`_

- [x] **Allocation-free case-insensitive sort** — `sort_by_cached_key` computes
      the lowercase key once per entry instead of allocating per comparison.
      _File: `sftp_ops.rs` — `list_dir()`_

- [ ] **Server-side directory cache with TTL** — the frontend now has a bounded
      LRU + prefetch limiter, which covers most repeated-navigation cost. Add a
      short-TTL cache in Rust only if measurements show re-listing is still hot.
      _Files: `sftp_ops.rs` or new `cache.rs`_

- [ ] **Paginate / lazy-load directory listings** — still loads all entries per
      directory. Gated on measured directory sizes (see `[PERF] list_dir`
      `entries: N`); do not build until a real directory is large enough to
      matter.

## Frontend (React / MUI)

- [x] **Cache hygiene** — directory cache is an LRU capped at 200 entries,
      prefetch is limited to 4 concurrent requests (was 20 parallel), and
      `clearCache()` now runs on connect/disconnect so listings from a previous
      session can never flash (generation counter drops stale in-flight results).
      _Files: `lib/dirCache.ts`, `lib/imageCache.ts`, `App.tsx`_

- [x] **Skeleton / shimmer loading state** — skeleton rows/cards replace the
      spinner on cold directory loads.
      _File: `FileBrowser.tsx`_

- [ ] **Virtualize the file list** — all entries still render as MUI `ListItem`
      nodes. Gated on measured directory sizes; if the biggest real directory is
      in the hundreds, skip this entirely.
      _File: `FileBrowser.tsx`_

- [ ] **Optimistic navigation** — show the loading state at the new path
      immediately instead of waiting for the response.
      _File: `FileBrowser.tsx`_

- [ ] **Fix `useEffect` dependency array** — the mount effect references
      `loadDir`/`path` with `[]` deps. Correctness nit, not a perf item.
      _File: `FileBrowser.tsx`_

- [x] **Remove dead command / deps** — deleted the never-invoked
      `sftp_download_file` command and dropped unused `react-router-dom` +
      `@tauri-apps/plugin-stronghold` from `package.json`.

## Attempts ledger

| Change | Expected | Verification | Result |
| --- | --- | --- | --- |
| Partial-read previews | Preview cost = 64 KB, not file size | VPS: preview a large file, compare `[PERF] read_file_preview` ms + bytes | pending VPS run |
| Raw-body chunked upload | No JSON blowup; flat memory; visible progress | VPS: upload ~100 MB before/after, watch UI progress + peak RSS | pending VPS run |
| Streaming save/cache | Flat RSS for large downloads | VPS: download ~100 MB, check RSS | pending VPS run |
| Epoch timestamps + cached sort | Fewer per-entry allocations; smaller listing payload | VPS: open a large directory, compare `[PERF] list_dir` ms | pending VPS run |
| Bounded dir cache + prefetch limiter | Bounded memory; no cross-session stale flash | Headless trace re-run (no regression: FCP 140 ms, script 60 ms, one 76 ms mount task vs baseline 132/47/69); reconnect test pending on device | frontend verified |
| Remove dead command / unused deps | Smaller surface | `cargo check`, `tsc`, `vite build` | done |
