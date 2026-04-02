/**
 * In-memory directory listing cache with background prefetch.
 *
 * When a directory is loaded, its child subdirectories are prefetched in
 * parallel (fire-and-forget) so that drilling down feels instant.
 *
 * All prefetch work is non-blocking — errors are silently swallowed and
 * the UI is never held up.
 */

import { invoke } from "@tauri-apps/api/core";
import type { FileEntry } from "./types";
const dirCache = new Map<string, FileEntry[]>();
const inflightDirs = new Set<string>();

const MAX_PREFETCH_DIRS = 20;

// ─── Cache accessors ──────────────────────────────────────────────────────────

export function getDirCached(path: string): FileEntry[] | null {
  return dirCache.get(path) ?? null;
}

export function setDirCached(path: string, entries: FileEntry[]): void {
  dirCache.set(path, entries);
}

export function getDirCachedCount(path: string): number | null {
  const cached = dirCache.get(path);
  return cached ? cached.length : null;
}

export function invalidateDirCache(path: string): void {
  dirCache.delete(path);
}

export function clearDirCache(): void {
  dirCache.clear();
  inflightDirs.clear();
}

// ─── Prefetch logic ───────────────────────────────────────────────────────────

/**
 * Fire-and-forget prefetch of child directory listings.  Call this after a
 * successful `list_dir` with the returned entries — it will kick off parallel
 * SFTP requests for each subdirectory without blocking the caller.
 */
export function prefetchChildren(entries: FileEntry[], sessionId: string): void {
  const dirs = entries.filter((e) => e.is_dir).slice(0, MAX_PREFETCH_DIRS);

  for (const dir of dirs) {
    if (dirCache.has(dir.path) || inflightDirs.has(dir.path)) continue;
    inflightDirs.add(dir.path);

    invoke<FileEntry[]>("sftp_list_dir", { sessionId, path: dir.path })
      .then((childEntries) => {
        setDirCached(dir.path, childEntries);
      })
      .catch(() => {})
      .finally(() => inflightDirs.delete(dir.path));
  }
}
