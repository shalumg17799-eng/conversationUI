// backend/src/services/cacheService.ts
// In-memory cache service with TTL, safe key handling, and logging.

type CacheEntry = {
  value: any;
  expiresAt: number; // timestamp in ms
};

/**
 * Simple deterministic hash function for strings.
 * Not cryptographically secure; sufficient for cache key distribution.
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // Convert to 32‑bit integer
  }
  return hash.toString(16);
}

/**
 * Generates a stable cache key from arbitrary input.
 * - If the key is already a string, it is used directly.
 * - Otherwise, it is JSON‑stringified (stable order) and optionally hashed.
 */
export function generateKey(key: unknown, useHash = false): string {
  if (typeof key === 'string') {
    return key;
  }
  // Stable JSON stringify: sort object keys
  const stableStringify = (obj: any): string => {
    if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) return JSON.stringify(obj.map(stableStringify));
    const sorted = Object.keys(obj)
      .sort()
      .reduce((acc, k) => ({ ...acc, [k]: (obj as any)[k] }), {});
    return JSON.stringify(sorted);
  };
  const str = stableStringify(key);
  return useHash ? simpleHash(str) : str;
}

/**
 * Generates a stable key for component selection decisions.
 * Based on intent, row count, column count, and time series status.
 */
export function generateDecisionKey(intent: any, shape: any): string {
  return generateKey({
    metric: intent.metric,
    dimension: intent.dimension,
    isTimeSeries: shape.isTimeSeries,
    rows: shape.rowCount,
    cols: shape.columnCount,
    type: 'decision'
  }, true);
}

export class CacheService {
  private cache = new Map<string, CacheEntry>();
  // Default TTL: 5 minutes
  private readonly defaultTtlMs = 5 * 60 * 1000;

  /** Retrieve a value from the cache. Returns null on miss or expired entry. */
  public get<T = any>(key: unknown): T | null {
    const cacheKey = generateKey(key);
    const entry = this.cache.get(cacheKey);
    if (!entry) {
      console.log('CACHE MISS', cacheKey);
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      // Expired – clean up
      this.cache.delete(cacheKey);
      console.log('CACHE MISS (expired)', cacheKey);
      return null;
    }
    console.log('CACHE HIT', cacheKey);
    return entry.value as T;
  }

  /** Store a value in the cache with optional TTL (ms). */
  public set(key: unknown, value: any, ttlMs?: number): void {
    const cacheKey = generateKey(key);
    const expiresAt = Date.now() + (ttlMs ?? this.defaultTtlMs);
    this.cache.set(cacheKey, { value, expiresAt });
    // No log for set to keep output clean – can be added if needed.
  }

  /** Remove a specific entry from the cache. */
  public delete(key: unknown): void {
    const cacheKey = generateKey(key);
    this.cache.delete(cacheKey);
  }

  /** Clear the entire cache. */
  public clear(): void {
    this.cache.clear();
  }
}

// Export a singleton for easy consumption across the codebase.
export const cacheService = new CacheService();
