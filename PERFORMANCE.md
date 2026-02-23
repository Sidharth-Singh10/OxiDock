# Performance Upgrade Checklist

Tracked improvements for SFTP file browsing and overall app responsiveness.

## Backend (Rust / SFTP)

- [x] **Reuse SFTP sessions** — Pool `SftpSession` inside `SshSession` via `tokio::sync::OnceCell`
      so a single SFTP channel is opened once per connection and reused for all operations.
      _Files: `ssh_manager.rs`, `sftp_ops.rs`_

- [ ] **Range-read for file previews** — `read_file_preview` currently downloads the entire file
      into memory, then truncates to `max_bytes`. Use SFTP `open` + `read(offset, len)` to fetch
      only the first N bytes without transferring the full file.
      _File: `sftp_ops.rs` — `read_file_preview()`_

- [ ] **Client-side directory cache with TTL** — Each navigation triggers a fresh `read_dir` over
      the network. Add an in-memory LRU cache keyed by `(session_id, path)` with a short TTL
      (~30s). Return cached results immediately and optionally revalidate in the background
      (stale-while-revalidate).
      _Files: `sftp_ops.rs` or new `cache.rs`, `commands.rs`_

- [ ] **Paginate / lazy-load directory listings** — `list_dir` collects all entries into a `Vec`
      before returning. For directories with thousands of files, return entries in batches (e.g., 100
      at a time) with a `readdir` continuation handle rather than loading everything at once. On the
      frontend, append pages as the user scrolls.
      _Files: `sftp_ops.rs`, `commands.rs`, `FileBrowser.tsx`_

- [ ] **Prefetch child directories** — When a directory is loaded, fire off background `list_dir`
      calls for the visible subdirectories. This makes drilling down feel instant since results are
      already cached by the time the user clicks.
      _Files: `sftp_ops.rs` or `commands.rs` (backend prefetch), `FileBrowser.tsx` (trigger on render)_

- [ ] **Return raw timestamps instead of formatted strings** — The `modified` field triggers a
      `chrono` conversion per-entry on the backend. Return raw `u64` Unix timestamps (or skip `mtime`
      for listings entirely) and format on the frontend with `Date`, removing per-entry allocation
      overhead in Rust.
      _Files: `sftp_ops.rs` (`FileEntry`), `lib/types.ts`, `FileBrowser.tsx`_

- [ ] **Allocation-free case-insensitive sort** — `sort_by` calls `to_lowercase()` on every
      comparison, allocating a new `String` each time. Pre-compute a lowercase sort key per entry,
      or compare char-by-char with `eq_ignore_ascii_case` / `unicase`.
      _File: `sftp_ops.rs` — `list_dir()`_

## Frontend (React / MUI)

- [ ] **Virtualize the file list** — All entries are rendered as MUI `ListItem` nodes at once.
      Large directories cause layout thrashing and slow DOM updates. Use `react-window` or
      `react-virtuoso` so only visible rows are mounted.
      _File: `FileBrowser.tsx`_

- [ ] **Add `loadDir` to the `useEffect` dependency array** — The initial `useEffect` depends on
      `[]` but references `loadDir` and `path`, which can lead to stale closures. Add `loadDir` to
      the dependency array (safe because it's wrapped in `useCallback`).
      _File: `FileBrowser.tsx`_

- [ ] **Optimistic navigation** — When clicking into a directory, immediately update the
      breadcrumbs and show the loading state at the new path rather than waiting for the response
      to update `path`. Makes navigation feel snappier even before data arrives.
      _File: `FileBrowser.tsx`_

- [ ] **Skeleton / shimmer loading state** — Replace the `CircularProgress` spinner with
      placeholder skeleton rows (e.g., MUI `Skeleton`) so the transition between directories feels
      smoother and the layout doesn't shift.
      _File: `FileBrowser.tsx`_

## Priority Order

| #  | Item                            | Impact | Effort |
|----|---------------------------------|--------|--------|
| 1  | ~~Reuse SFTP sessions~~         | High   | Low    |
| 2  | Range-read for file previews    | High   | Low    |
| 3  | Directory cache with TTL        | Medium | Medium |
| 4  | Virtualize file list            | Medium | Medium |
| 5  | Paginate / lazy-load listings   | Medium | High   |
| 6  | Prefetch child directories      | Medium | Medium |
| 7  | Return raw timestamps           | Medium | Low    |
| 8  | Optimistic navigation           | Low    | Low    |
| 9  | Skeleton / shimmer loading      | Low    | Low    |
| 10 | Allocation-free sort            | Low    | Low    |
| 11 | Fix useEffect dependencies      | Low    | Low    |
