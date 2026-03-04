/**
 * Debounced batch collector for thumbnail requests.
 *
 * Instead of each ImageThumbnail firing its own `sftp_get_thumbnail` invoke,
 * requests accumulate over a short window (BATCH_DELAY_MS) and are flushed
 * as a single `sftp_get_thumbnails_batch` call.  This cuts IPC overhead from
 * O(N) invokes to O(1) per render frame.
 */

import { invoke } from "@tauri-apps/api/core";
import {
  isThumbnailCached,
  getThumbnailCached,
  setThumbnailCached,
} from "./imageCache";

interface PendingRequest {
  path: string;
  remoteMtime?: number;
  resolve: (b64: string) => void;
  reject: (err: unknown) => void;
}

const BATCH_DELAY_MS = 30;

const pending = new Map<string, PendingRequest[]>();
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Request a single thumbnail.  Returns a promise that resolves with the
 * base64 data.  Under the hood, the request is batched with others that
 * arrive within the same BATCH_DELAY_MS window.
 */
export function requestThumbnail(
  sessionId: string,
  path: string,
  remoteMtime?: number,
): Promise<string> {
  if (isThumbnailCached(path)) {
    return Promise.resolve(getThumbnailCached(path)!);
  }

  return new Promise((resolve, reject) => {
    let bucket = pending.get(sessionId);
    if (!bucket) {
      bucket = [];
      pending.set(sessionId, bucket);
    }
    bucket.push({ path, remoteMtime, resolve, reject });

    if (!timer) {
      timer = setTimeout(flush, BATCH_DELAY_MS);
    }
  });
}

async function flush(): Promise<void> {
  timer = null;
  const snapshot = new Map(pending);
  pending.clear();

  for (const [sessionId, requests] of snapshot) {
    const uncached = requests.filter((r) => {
      if (isThumbnailCached(r.path)) {
        r.resolve(getThumbnailCached(r.path)!);
        return false;
      }
      return true;
    });

    if (uncached.length === 0) continue;

    const payload = uncached.map((r) => ({
      path: r.path,
      remote_mtime: r.remoteMtime,
    }));

    invoke<Record<string, string>>("sftp_get_thumbnails_batch", {
      sessionId,
      requests: payload,
    })
      .then((results) => {
        for (const req of uncached) {
          const b64 = results[req.path];
          if (b64) {
            setThumbnailCached(req.path, b64);
            req.resolve(b64);
          } else {
            req.reject(new Error("Thumbnail not in batch result"));
          }
        }
      })
      .catch((err) => {
        for (const req of uncached) {
          req.reject(err);
        }
      });
  }
}

/** Cancel all pending requests (call on disconnect / unmount). */
export function clearPendingBatch(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  pending.clear();
}
