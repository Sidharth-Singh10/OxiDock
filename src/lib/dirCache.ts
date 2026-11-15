/**
 * In-memory directory listing cache with bounded background prefetch.
 *
 * When a directory is loaded, its child subdirectories are queued for
 * prefetch (fire-and-forget, at most `MAX_PREFETCH_CONCURRENCY` in flight at
 * a time) so that drilling down feels instant without hammering the server.
 *
 * The cache is an LRU with a fixed capacity, and `clearDirCache()` bumps a
 * generation counter so results from an old session can never repopulate it.
 */

import { invoke } from "@tauri-apps/api/core";
import type { FileEntry } from "./types";

const MAX_CACHED_DIRS = 200;
const MAX_PREFETCH_DIRS = 20;
const MAX_PREFETCH_CONCURRENCY = 4;

/** A Map with LRU eviction — same pattern as the image cache. */
class LRUMap<K, V> extends Map<K, V> {
  private maxSize: number;

  constructor(maxSize: number) {
    super();
    this.maxSize = maxSize;
  }

  override get(key: K): V | undefined {
    if (!super.has(key)) return undefined;
    const value = super.get(key)!;
    super.delete(key);
    super.set(key, value);
    return value;
  }

  override set(key: K, value: V): this {
    if (super.has(key)) super.delete(key);
    super.set(key, value);
    while (this.size > this.maxSize) {
      const oldest = this.keys().next().value;
      if (oldest !== undefined) super.delete(oldest);
    }
    return this;
  }
}

const dirCache = new LRUMap<string, FileEntry[]>(MAX_CACHED_DIRS);
const inflightDirs = new Set<string>();

interface PrefetchJob {
  path: string;
  sessionId: string;
  generation: number;
}

const prefetchQueue: PrefetchJob[] = [];
let activePrefetch = 0;
let generation = 0;

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
  generation++;
  dirCache.clear();
  inflightDirs.clear();
  prefetchQueue.length = 0;
}

// ─── Prefetch logic ───────────────────────────────────────────────────────────

function pumpPrefetchQueue(): void {
  while (activePrefetch < MAX_PREFETCH_CONCURRENCY && prefetchQueue.length > 0) {
    const job = prefetchQueue.shift()!;
    activePrefetch++;

    invoke<FileEntry[]>("sftp_list_dir", { sessionId: job.sessionId, path: job.path })
      .then((entries) => {
        // Drop results that arrived after a cache reset (e.g. disconnect).
        if (job.generation === generation) setDirCached(job.path, entries);
      })
      .catch(() => {
        // Prefetch is best-effort; errors are silently swallowed.
      })
      .finally(() => {
        if (job.generation === generation) inflightDirs.delete(job.path);
        activePrefetch--;
        pumpPrefetchQueue();
      });
  }
}

/**
 * Queue child directory listings for background prefetch. Call this after a
 * successful `list_dir` with the returned entries.
 */
export function prefetchChildren(entries: FileEntry[], sessionId: string): void {
  const dirs = entries.filter((e) => e.is_dir).slice(0, MAX_PREFETCH_DIRS);

  for (const dir of dirs) {
    if (dirCache.has(dir.path) || inflightDirs.has(dir.path)) continue;
    inflightDirs.add(dir.path);
    prefetchQueue.push({ path: dir.path, sessionId, generation });
  }

  pumpPrefetchQueue();
}
