/**
 * In-memory directory listing cache with background prefetch.
 *
 * When a directory is loaded, its child subdirectories are prefetched in
 * parallel (fire-and-forget) so that drilling down feels instant.  Image
 * thumbnails inside those child directories are also warmed into the
 * thumbnail cache from imageCache.ts.
 *
 * All prefetch work is non-blocking — errors are silently swallowed and
 * the UI is never held up.
 */

import { invoke } from "@tauri-apps/api/core";
import type { FileEntry } from "./types";
import { isThumbnailCached, setThumbnailCached } from "./imageCache";

const dirCache = new Map<string, FileEntry[]>();
const inflightDirs = new Set<string>();
const inflightThumbs = new Set<string>();

const MAX_PREFETCH_DIRS = 20;
const MAX_PREFETCH_THUMBS_PER_DIR = 8;

// ─── Cache accessors ──────────────────────────────────────────────────────────

export function getDirCached(path: string): FileEntry[] | null {
  return dirCache.get(path) ?? null;
}

export function setDirCached(path: string, entries: FileEntry[]): void {
  dirCache.set(path, entries);
}

export function invalidateDirCache(path: string): void {
  dirCache.delete(path);
}

export function clearDirCache(): void {
  dirCache.clear();
  inflightDirs.clear();
  inflightThumbs.clear();
}

// ─── Prefetch logic ───────────────────────────────────────────────────────────

function prefetchThumbnails(entries: FileEntry[], sessionId: string): void {
  const images = entries
    .filter((e) => e.is_image)
    .slice(0, MAX_PREFETCH_THUMBS_PER_DIR);

  for (const img of images) {
    if (isThumbnailCached(img.path) || inflightThumbs.has(img.path)) continue;
    inflightThumbs.add(img.path);

    invoke<string>("sftp_get_thumbnail", { sessionId, path: img.path })
      .then((b64) => setThumbnailCached(img.path, b64))
      .catch(() => {})
      .finally(() => inflightThumbs.delete(img.path));
  }
}

/**
 * Fire-and-forget prefetch of child directory listings and their image
 * thumbnails.  Call this after a successful `list_dir` with the returned
 * entries — it will kick off parallel SFTP requests for each subdirectory
 * without blocking the caller.
 */
export function prefetchChildren(entries: FileEntry[], sessionId: string): void {
  const dirs = entries.filter((e) => e.is_dir).slice(0, MAX_PREFETCH_DIRS);

  for (const dir of dirs) {
    if (dirCache.has(dir.path) || inflightDirs.has(dir.path)) continue;
    inflightDirs.add(dir.path);

    invoke<FileEntry[]>("sftp_list_dir", { sessionId, path: dir.path })
      .then((childEntries) => {
        setDirCached(dir.path, childEntries);
        prefetchThumbnails(childEntries, sessionId);
      })
      .catch(() => {})
      .finally(() => inflightDirs.delete(dir.path));
  }
}
