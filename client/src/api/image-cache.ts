/**
 * In-memory LRU cache for authenticated image blobs.
 *
 * Blobs are keyed by the API path passed to ListingImage (e.g.
 * "/listings/:id/images/:imgId"). The cache is intentionally a module-level
 * singleton so the same data is shared across all components in a session.
 *
 * Key design points:
 * - In-flight deduplication: if two components request the same image
 *   concurrently, only one network fetch is issued; both await the same
 *   Promise.
 * - LRU eviction: a plain Map preserves insertion order. On access the entry
 *   is moved to the end (most-recently-used). Entries at the front are evicted
 *   when the byte budget is exceeded.
 * - Session scoping: clearImageCache() must be called whenever the active
 *   session changes or expires. App.tsx is responsible for calling it.
 * - Listing deletion: call invalidateImages(paths) with the image paths
 *   belonging to the deleted listing so stale blobs do not occupy memory.
 * - Stale request safety: if a request is cleared or invalidated before it
 *   resolves, it will not store its blob in the cache or interfere with a
 *   newer request for the same path.
 */

/** Maximum total byte size of cached blobs (32 MiB). */
export const MAX_CACHE_BYTES = 32 * 1024 * 1024;

interface CacheEntry {
  blob: Blob;
  bytes: number;
}

interface InFlightEntry {
  promise: Promise<Blob>;
  generation: number;
  requestId: number;
}

/** Resolved blobs, ordered from least-recently-used (front) to MRU (back). */
const lruMap = new Map<string, CacheEntry>();

/** In-flight requests, keyed by the same path, to deduplicate concurrent fetches. */
const inFlight = new Map<string, InFlightEntry>();

let totalBytes = 0;
let globalClearGeneration = 0;
let nextRequestId = 0;

/**
 * Returns the cached blob for `path`, or calls `fetchFn` to retrieve it.
 * Concurrent callers for the same path share one in-flight fetch.
 */
export async function getCachedImage(
  path: string,
  fetchFn: (path: string) => Promise<Blob>,
): Promise<Blob> {
  // Cache hit — promote to MRU and return.
  const cached = lruMap.get(path);
  if (cached) {
    lruMap.delete(path);
    lruMap.set(path, cached);
    return cached.blob;
  }

  // Deduplicate: if a fetch for this path is already in-flight AND not invalidated, share it.
  const existing = inFlight.get(path);
  if (existing && existing.generation === globalClearGeneration) {
    return existing.promise;
  }

  // Capture the current global clear generation and assign a unique request ID.
  const requestClearGeneration = globalClearGeneration;
  const requestId = nextRequestId++;

  const promise = fetchFn(path).then((blob) => {
    const entry = inFlight.get(path);

    // Only remove and cache if this exact request is still current.
    // Check both: (1) the entry exists, (2) it's the same request ID.
    if (entry && entry.requestId === requestId) {
      inFlight.delete(path);
      // Only store if the cache hasn't been globally cleared since this request started.
      if (globalClearGeneration === requestClearGeneration) {
        store(path, blob);
      }
    }
    return blob;
  }).catch((error: unknown) => {
    const entry = inFlight.get(path);
    // Only remove if this exact request is still current.
    if (entry && entry.requestId === requestId) {
      inFlight.delete(path);
    }
    throw error;
  });

  inFlight.set(path, { promise, generation: requestClearGeneration, requestId });
  return promise;
}

/**
 * Removes specific paths from the cache. Call this after deleting a listing so
 * its images do not keep blobs alive in memory. In-flight requests for these
 * paths will not repopulate the cache when they resolve.
 */
export function invalidateImages(paths: readonly string[]): void {
  for (const path of paths) {
    const entry = lruMap.get(path);
    if (entry) {
      totalBytes -= entry.bytes;
      lruMap.delete(path);
    }
    // Remove any in-flight entry. When the old request resolves, it will see
    // that its requestId no longer matches and will not cache or interfere.
    // Any new request will start fresh with a new requestId.
    inFlight.delete(path);
  }
}

/**
 * Clears the entire cache. Call this whenever the session changes or expires.
 * In-flight requests will not repopulate the cache when they resolve.
 */
export function clearImageCache(): void {
  globalClearGeneration++;
  lruMap.clear();
  inFlight.clear();
  totalBytes = 0;
}

/** Returns the current number of entries and total bytes (for tests). */
export function imageCacheStats(): { size: number; totalBytes: number } {
  return { size: lruMap.size, totalBytes };
}

// --- internal helpers ---

function store(path: string, blob: Blob): void {
  const bytes = blob.size;

  // If this single blob exceeds the entire budget, skip caching it.
  if (bytes > MAX_CACHE_BYTES) return;

  // Evict LRU entries until there is room.
  evictUntil(MAX_CACHE_BYTES - bytes);

  lruMap.set(path, { blob, bytes });
  totalBytes += bytes;
}

function evictUntil(targetBytes: number): void {
  // Map iteration order is insertion order (LRU is at the front).
  for (const [key, entry] of lruMap) {
    if (totalBytes <= targetBytes) break;
    totalBytes -= entry.bytes;
    lruMap.delete(key);
  }
}
