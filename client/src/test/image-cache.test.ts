import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearImageCache,
  getCachedImage,
  imageCacheStats,
  invalidateImages,
  MAX_CACHE_BYTES,
} from "../api/image-cache";

function makeBlob(sizeBytes: number, type = "image/webp"): Blob {
  return new Blob([new Uint8Array(sizeBytes)], { type });
}

afterEach(() => {
  clearImageCache();
});

describe("getCachedImage", () => {
  it("calls fetchFn on the first request and returns the blob", async () => {
    const blob = makeBlob(100);
    const fetchFn = vi.fn().mockResolvedValue(blob);

    const result = await getCachedImage("/listings/1/images/a", fetchFn);

    expect(result).toBe(blob);
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(fetchFn).toHaveBeenCalledWith("/listings/1/images/a");
  });

  it("returns the cached blob on a second request without calling fetchFn again", async () => {
    const blob = makeBlob(100);
    const fetchFn = vi.fn().mockResolvedValue(blob);

    await getCachedImage("/listings/1/images/a", fetchFn);
    const second = await getCachedImage("/listings/1/images/a", fetchFn);

    expect(second).toBe(blob);
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("issues separate fetches for different paths", async () => {
    const blobA = makeBlob(100);
    const blobB = makeBlob(200);
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(blobA)
      .mockResolvedValueOnce(blobB);

    const a = await getCachedImage("/listings/1/images/a", fetchFn);
    const b = await getCachedImage("/listings/1/images/b", fetchFn);

    expect(a).toBe(blobA);
    expect(b).toBe(blobB);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent requests for the same path — only one fetch is issued", async () => {
    const blob = makeBlob(100);
    let resolveBlob!: (b: Blob) => void;
    const pending = new Promise<Blob>((resolve) => { resolveBlob = resolve; });
    const fetchFn = vi.fn().mockReturnValue(pending);

    const p1 = getCachedImage("/listings/1/images/a", fetchFn);
    const p2 = getCachedImage("/listings/1/images/a", fetchFn);

    resolveBlob(blob);
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1).toBe(blob);
    expect(r2).toBe(blob);
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("re-fetches after a failed request (failed requests are not cached)", async () => {
    const fetchFn = vi.fn()
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce(makeBlob(100));

    await expect(getCachedImage("/listings/1/images/a", fetchFn)).rejects.toThrow("network error");
    await expect(getCachedImage("/listings/1/images/a", fetchFn)).resolves.toBeInstanceOf(Blob);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("re-fetches after clearImageCache is called", async () => {
    const blob1 = makeBlob(100);
    const blob2 = makeBlob(100);
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(blob1)
      .mockResolvedValueOnce(blob2);

    await getCachedImage("/listings/1/images/a", fetchFn);
    clearImageCache();
    const result = await getCachedImage("/listings/1/images/a", fetchFn);

    expect(result).toBe(blob2);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

describe("LRU eviction", () => {
  it("evicts the least-recently-used entry when the byte budget is exceeded", async () => {
    // Fill cache with two blobs whose combined size equals the budget.
    const half = MAX_CACHE_BYTES / 2;
    const blobA = makeBlob(half);
    const blobB = makeBlob(half);
    const blobC = makeBlob(half);
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(blobA)
      .mockResolvedValueOnce(blobB)
      .mockResolvedValueOnce(blobC)
      .mockResolvedValueOnce(blobA); // re-fetch of A after eviction

    await getCachedImage("/listings/1/images/a", fetchFn);
    await getCachedImage("/listings/1/images/b", fetchFn);

    // Adding C (half budget) must evict A (the LRU entry).
    await getCachedImage("/listings/1/images/c", fetchFn);

    expect(imageCacheStats().size).toBe(2);

    // A must be fetched again — it was evicted.
    await getCachedImage("/listings/1/images/a", fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it("promotes an accessed entry to MRU so it is not the first to be evicted", async () => {
    const half = MAX_CACHE_BYTES / 2;
    const blobA = makeBlob(half);
    const blobB = makeBlob(half);
    const blobC = makeBlob(half);
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(blobA)
      .mockResolvedValueOnce(blobB)
      .mockResolvedValueOnce(blobC);

    await getCachedImage("/listings/1/images/a", fetchFn);  // call 1: fetch A
    await getCachedImage("/listings/1/images/b", fetchFn);  // call 2: fetch B

    // Access A again — promotes it to MRU; B becomes the new LRU.
    // This is a cache hit, so fetchFn must NOT be called a third time.
    const aAgain = await getCachedImage("/listings/1/images/a", fetchFn);
    expect(aAgain).toBe(blobA);
    expect(fetchFn).toHaveBeenCalledTimes(2); // only the two initial fetches

    // Adding C (half budget) must evict B (the LRU), not A.
    await getCachedImage("/listings/1/images/c", fetchFn);  // call 3: fetch C

    // A should still be in cache — no additional fetch needed.
    const aStillCached = await getCachedImage("/listings/1/images/a", fetchFn);
    expect(aStillCached).toBe(blobA);
    expect(fetchFn).toHaveBeenCalledTimes(3); // A + B + C, no re-fetch of A

    // B was evicted — requesting it now must trigger a fresh fetch.
    const bFourth = vi.fn().mockResolvedValueOnce(makeBlob(half));
    await getCachedImage("/listings/1/images/b", bFourth);
    expect(bFourth).toHaveBeenCalledOnce();
  });

  it("tracks totalBytes correctly after eviction", async () => {
    const half = MAX_CACHE_BYTES / 2;
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(makeBlob(half))
      .mockResolvedValueOnce(makeBlob(half))
      .mockResolvedValueOnce(makeBlob(half));

    await getCachedImage("/listings/1/images/a", fetchFn);
    await getCachedImage("/listings/1/images/b", fetchFn);
    await getCachedImage("/listings/1/images/c", fetchFn);

    const { totalBytes } = imageCacheStats();
    expect(totalBytes).toBe(MAX_CACHE_BYTES); // two entries of half each
  });
});

describe("invalidateImages", () => {
  it("removes the specified paths and triggers a re-fetch", async () => {
    const blob1 = makeBlob(100);
    const blob2 = makeBlob(100);
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(blob1)
      .mockResolvedValueOnce(blob2);

    await getCachedImage("/listings/1/images/a", fetchFn);
    expect(imageCacheStats().size).toBe(1);

    invalidateImages(["/listings/1/images/a"]);
    expect(imageCacheStats().size).toBe(0);

    // Must fetch again after invalidation.
    const result = await getCachedImage("/listings/1/images/a", fetchFn);
    expect(result).toBe(blob2);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("adjusts totalBytes when entries are removed", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(makeBlob(500))
      .mockResolvedValueOnce(makeBlob(300));

    await getCachedImage("/listings/1/images/a", fetchFn);
    await getCachedImage("/listings/1/images/b", fetchFn);
    expect(imageCacheStats().totalBytes).toBe(800);

    invalidateImages(["/listings/1/images/a"]);
    expect(imageCacheStats().totalBytes).toBe(300);
  });

  it("is a no-op for paths that are not in the cache", () => {
    expect(() => invalidateImages(["/listings/99/images/x"])).not.toThrow();
    expect(imageCacheStats().size).toBe(0);
  });

  it("only removes the specified paths and leaves others intact", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(makeBlob(100))
      .mockResolvedValueOnce(makeBlob(100));

    await getCachedImage("/listings/1/images/a", fetchFn);
    await getCachedImage("/listings/1/images/b", fetchFn);

    invalidateImages(["/listings/1/images/a"]);

    // B must still be cached — no second fetch.
    await getCachedImage("/listings/1/images/b", fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(2); // initial A + initial B only
  });
});

describe("clearImageCache", () => {
  it("removes all entries and resets totalBytes", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValue(makeBlob(100));

    await getCachedImage("/listings/1/images/a", fetchFn);
    await getCachedImage("/listings/1/images/b", fetchFn);

    clearImageCache();

    const { size, totalBytes } = imageCacheStats();
    expect(size).toBe(0);
    expect(totalBytes).toBe(0);
  });

  it("prevents in-flight requests from repopulating the cache after clear", async () => {
    const blob = makeBlob(100);
    let resolveBlob!: (b: Blob) => void;
    const pending = new Promise<Blob>((resolve) => { resolveBlob = resolve; });
    const fetchFn = vi.fn().mockReturnValue(pending);

    const p = getCachedImage("/listings/1/images/a", fetchFn);

    clearImageCache();

    resolveBlob(blob);
    const result = await p;

    expect(result).toBe(blob); // fetch completes and returns the blob
    expect(imageCacheStats().size).toBe(0); // but does not populate the cache
    expect(imageCacheStats().totalBytes).toBe(0);
  });

  it("allows a new request for the same path after clearing an in-flight request", async () => {
    const blob1 = makeBlob(100);
    const blob2 = makeBlob(200);
    let resolveFirst!: (b: Blob) => void;
    const firstPending = new Promise<Blob>((resolve) => { resolveFirst = resolve; });
    const fetchFn = vi.fn()
      .mockReturnValueOnce(firstPending)
      .mockResolvedValueOnce(blob2);

    const p1 = getCachedImage("/listings/1/images/a", fetchFn);
    clearImageCache();

    // Start a new request for the same path after clearing.
    const p2 = getCachedImage("/listings/1/images/a", fetchFn);

    // Resolve the first request (stale).
    resolveFirst(blob1);
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1).toBe(blob1); // first request returns its blob
    expect(r2).toBe(blob2); // second request is independent

    // Only the second (newer) fetch should be cached.
    expect(imageCacheStats().size).toBe(1);
    expect(imageCacheStats().totalBytes).toBe(200);

    // Verify that the cached entry is from the second fetch.
    const fetchFn3 = vi.fn();
    await getCachedImage("/listings/1/images/a", fetchFn3);
    expect(fetchFn3).not.toHaveBeenCalled(); // cache hit from blob2
  });
});

describe("invalidateImages with in-flight requests", () => {
  it("prevents invalidated in-flight requests from repopulating the cache", async () => {
    const blob = makeBlob(100);
    let resolveBlob!: (b: Blob) => void;
    const pending = new Promise<Blob>((resolve) => { resolveBlob = resolve; });
    const fetchFn = vi.fn().mockReturnValue(pending);

    const p = getCachedImage("/listings/1/images/a", fetchFn);

    invalidateImages(["/listings/1/images/a"]);

    resolveBlob(blob);
    const result = await p;

    expect(result).toBe(blob); // fetch completes and returns the blob
    expect(imageCacheStats().size).toBe(0); // but does not populate the cache
    expect(imageCacheStats().totalBytes).toBe(0);
  });

  it("allows a new request for an invalidated path while an old request is still pending", async () => {
    const blob1 = makeBlob(100);
    const blob2 = makeBlob(200);
    let resolveFirst!: (b: Blob) => void;
    const firstPending = new Promise<Blob>((resolve) => { resolveFirst = resolve; });
    const fetchFn = vi.fn()
      .mockReturnValueOnce(firstPending)
      .mockResolvedValueOnce(blob2);

    const p1 = getCachedImage("/listings/1/images/a", fetchFn);
    invalidateImages(["/listings/1/images/a"]);

    // Start a new request for the same path after invalidating.
    const p2 = getCachedImage("/listings/1/images/a", fetchFn);

    // Resolve the first request (stale).
    resolveFirst(blob1);
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1).toBe(blob1); // first request returns its blob
    expect(r2).toBe(blob2); // second request is independent

    // Only the second (newer) fetch should be cached.
    expect(imageCacheStats().size).toBe(1);
    expect(imageCacheStats().totalBytes).toBe(200);
  });

  it("does not prevent other paths from being cached when one path is invalidated", async () => {
    const blobA = makeBlob(100);
    const blobB = makeBlob(200);
    let resolveA!: (b: Blob) => void;
    const pendingA = new Promise<Blob>((resolve) => { resolveA = resolve; });
    const fetchFn = vi.fn()
      .mockReturnValueOnce(pendingA)
      .mockResolvedValueOnce(blobB);

    const pA = getCachedImage("/listings/1/images/a", fetchFn);
    const pB = getCachedImage("/listings/1/images/b", fetchFn);

    // Invalidate only A while both are in-flight.
    invalidateImages(["/listings/1/images/a"]);

    resolveA(blobA);
    await Promise.all([pA, pB]);

    // A should not be cached (invalidated), but B should be (not invalidated).
    expect(imageCacheStats().size).toBe(1);
    expect(imageCacheStats().totalBytes).toBe(200);

    // Verify B is still cached.
    const fetchFn2 = vi.fn();
    await getCachedImage("/listings/1/images/b", fetchFn2);
    expect(fetchFn2).not.toHaveBeenCalled(); // cache hit
  });

  it("prevents an old request from deleting a newer request's in-flight entry", async () => {
    const blob1 = makeBlob(100);
    const blob2 = makeBlob(200);
    let resolveFirst!: (b: Blob) => void;
    let resolveSecond!: (b: Blob) => void;
    const firstPending = new Promise<Blob>((resolve) => { resolveFirst = resolve; });
    const secondPending = new Promise<Blob>((resolve) => { resolveSecond = resolve; });
    const fetchFn = vi.fn()
      .mockReturnValueOnce(firstPending)
      .mockReturnValueOnce(secondPending);

    // Start first request (will be slow).
    const p1 = getCachedImage("/listings/1/images/a", fetchFn);

    // Invalidate the path.
    invalidateImages(["/listings/1/images/a"]);

    // Start a new request for the same path.
    const p2 = getCachedImage("/listings/1/images/a", fetchFn);

    // Resolve the stale request first. It must not delete the newer in-flight entry.
    resolveFirst(blob1);
    const r1 = await p1;

    expect(r1).toBe(blob1);
    expect(imageCacheStats().size).toBe(0);

    // A third caller should still share the newer request rather than starting another fetch.
    const p3 = getCachedImage("/listings/1/images/a", fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(2);

    resolveSecond(blob2);
    const [r2, r3] = await Promise.all([p2, p3]);
    expect(r2).toBe(blob2);
    expect(r3).toBe(blob2);

    // Only blob2 (from the newer request) should be cached.
    expect(imageCacheStats().size).toBe(1);
    expect(imageCacheStats().totalBytes).toBe(200);
  });
});
