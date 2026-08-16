/**
 * Caches candidate avatar bytes across page reloads, keyed by the stable S3 object
 * path rather than the full URL — the backend returns a freshly-signed presigned URL
 * (rotating signature/expiry query string) on every API call, which would otherwise
 * defeat normal browser HTTP caching even though the underlying photo hasn't changed.
 *
 * Two layers:
 *  - `caches` (Cache Storage API): durable, survives full page reloads.
 *  - `objectUrlCache` (in-memory): `URL.createObjectURL` handles, valid for this page's
 *    lifetime only — recreated from the durable cache on first use after a reload.
 */

import { useEffect, useState } from "react";

const CACHE_NAME = "candidate-avatars-v1";
const objectUrlCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

function stableKey(url: string): string {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return url;
  }
}

async function loadFromCacheStorage(key: string): Promise<Blob | null> {
  if (typeof caches === "undefined") return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const match = await cache.match(key);
    return match ? await match.blob() : null;
  } catch {
    return null;
  }
}

async function saveToCacheStorage(key: string, response: Response): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(key, response);
  } catch {
    // best-effort — ignore quota/storage errors
  }
}

async function load(key: string, presignedUrl: string): Promise<string> {
  const cachedBlob = await loadFromCacheStorage(key);
  if (cachedBlob) {
    const objectUrl = URL.createObjectURL(cachedBlob);
    objectUrlCache.set(key, objectUrl);
    return objectUrl;
  }

  const res = await fetch(presignedUrl);
  if (!res.ok) throw new Error(`Failed to load avatar (${res.status})`);
  void saveToCacheStorage(key, res.clone());
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  objectUrlCache.set(key, objectUrl);
  return objectUrl;
}

/** Resolves to a stable, cached object URL for a candidate's presigned avatar URL. */
export function getCachedAvatarUrl(presignedUrl: string): Promise<string> {
  const key = stableKey(presignedUrl);

  const existing = objectUrlCache.get(key);
  if (existing) return Promise.resolve(existing);

  let promise = inflight.get(key);
  if (!promise) {
    promise = load(key, presignedUrl).finally(() => inflight.delete(key));
    inflight.set(key, promise);
  }
  return promise;
}

/** React hook wrapper around {@link getCachedAvatarUrl} — resolves null while loading/absent. */
export function useCachedAvatarUrl(url: string | null | undefined): string | null {
  const [resolved, setResolved] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    getCachedAvatarUrl(url)
      .then((u) => {
        if (!cancelled) setResolved(u);
      })
      .catch(() => {
        if (!cancelled) setResolved(null);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return url ? resolved : null;
}
