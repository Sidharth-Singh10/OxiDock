/**
 * In-memory image cache for the current session.
 * Prevents redundant SFTP downloads when the user revisits images.
 *
 * Two separate caches:
 *  - thumbnailCache  — stores base64 strings from sftp_get_thumbnail (native WebP thumbnails)
 *  - fullImageCache  — stores local file paths from sftp_cache_image (full downloads)
 */

import type { ImageCacheEntry } from "./types";

// ─── Full-image cache (local file paths) ─────────────────────────────────────

const fullImageCache = new Map<string, ImageCacheEntry>();

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

const thumbnailCache = new Map<string, string>();

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

/** Clears both caches (call on disconnect). */
export function clearCache(): void {
  fullImageCache.clear();
  thumbnailCache.clear();
}
