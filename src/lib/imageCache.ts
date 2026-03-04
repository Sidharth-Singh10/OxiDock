/**
 * In-memory image cache for the current session.
 * Prevents redundant SFTP downloads when the user revisits images.
 *
 * Two separate caches:
 *  - thumbnailCache  — stores base64 strings from sftp_get_thumbnail (native WebP thumbnails)
 *  - fullImageCache  — stores local file paths from sftp_cache_image (full downloads)
 *
 * Both use LRU eviction to prevent unbounded memory growth.
 */

import type { ImageCacheEntry } from "./types";
import { clearDirCache } from "./dirCache";

// ─── LRU Map ──────────────────────────────────────────────────────────────────

/**
 * A Map with a maximum capacity that evicts the least-recently-used entry
 * when a new entry would exceed the limit. `get()` promotes the accessed key
 * to "most recently used".
 */
class LRUMap<K, V> extends Map<K, V> {
  private maxSize: number;

  constructor(maxSize: number) {
    super();
    this.maxSize = maxSize;
  }

  override get(key: K): V | undefined {
    if (!super.has(key)) return undefined;
    // Promote to most-recently-used by re-inserting
    const value = super.get(key)!;
    super.delete(key);
    super.set(key, value);
    return value;
  }

  override set(key: K, value: V): this {
    // If already present, delete first so it moves to the end
    if (super.has(key)) {
      super.delete(key);
    }
    super.set(key, value);
    // Evict oldest entries if over capacity
    while (this.size > this.maxSize) {
      const oldest = this.keys().next().value;
      if (oldest !== undefined) {
        super.delete(oldest);
      }
    }
    return this;
  }
}

// ─── Full-image cache (local file paths) ─────────────────────────────────────

const MAX_FULL_IMAGES = 50;
const fullImageCache = new LRUMap<string, ImageCacheEntry>(MAX_FULL_IMAGES);

/** Returns the local cached file path for a remote path, or null if not cached. */
export function getCached(remotePath: string): string | null {
  return fullImageCache.get(remotePath)?.localPath ?? null;
}

/** Stores a local file path as the cache entry for a remote path. */
export function setCached(remotePath: string, localPath: string): void {
  fullImageCache.set(remotePath, {
    localPath,
    remotePath,
    cachedAt: Date.now(),
  });
}

/** Returns true if the remote path has an entry in the full-image cache. */
export function isCached(remotePath: string): boolean {
  return fullImageCache.has(remotePath);
}

// ─── Thumbnail cache (base64 strings) ────────────────────────────────────────

const MAX_THUMBNAILS = 200;
const thumbnailCache = new LRUMap<string, string>(MAX_THUMBNAILS);

/**
 * Returns the cached base64 thumbnail string for a remote path, or null.
 * This avoids re-fetching thumbnails when the user navigates back into a folder.
 */
export function getThumbnailCached(remotePath: string): string | null {
  return thumbnailCache.get(remotePath) ?? null;
}

/** Stores a base64 thumbnail string for a remote path. */
export function setThumbnailCached(remotePath: string, b64: string): void {
  thumbnailCache.set(remotePath, b64);
}

/** Returns true if a thumbnail is cached for the remote path. */
export function isThumbnailCached(remotePath: string): boolean {
  return thumbnailCache.has(remotePath);
}

// ─── Session cleanup ──────────────────────────────────────────────────────────

/** Clears all caches — images, thumbnails, and directory listings (call on disconnect). */
export function clearCache(): void {
  fullImageCache.clear();
  thumbnailCache.clear();
  clearDirCache();
}
