// Permission Cache - TTL-based caching to reduce redundant native module calls
// Implements a time-to-live (TTL) cache pattern for permission status checks

import type { PermissionType, PermissionStatus, CachedPermissionResult } from './types';

/**
 * Cache for permission status with TTL (time-to-live)
 *
 * Purpose:
 * - Reduce redundant calls to native modules
 * - Improve performance by returning cached results when fresh
 * - Balance between freshness and performance (30s TTL)
 *
 * Cache Invalidation:
 * - Automatic: After TTL expires (30 seconds)
 * - Manual: When user returns from settings (AppState change)
 * - Manual: After permission request completes
 */
export class PermissionCache {
  /** Cache storage: Map of permission type to cached result */
  private cache = new Map<PermissionType, CachedPermissionResult>();

  /** Time-to-live in milliseconds (30 seconds) */
  private readonly TTL: number;

  /**
   * Create a new permission cache
   *
   * @param ttlMs - Time-to-live in milliseconds (default: 30000ms = 30s)
   */
  constructor(ttlMs: number = 30000) {
    this.TTL = ttlMs;
  }

  /**
   * Get cached permission status if available and fresh
   *
   * @param type - Permission type to retrieve
   * @returns Cached permission status if fresh, null otherwise
   *
   * @example
   * ```typescript
   * const cache = new PermissionCache();
   *
   * // First call - returns null (not cached)
   * const cached1 = cache.get('camera'); // null
   *
   * // Set cache
   * cache.set('camera', { granted: true, ... });
   *
   * // Second call - returns cached value
   * const cached2 = cache.get('camera'); // { granted: true, ... }
   *
   * // After TTL expires - returns null
   * // ... wait 30 seconds ...
   * const cached3 = cache.get('camera'); // null
   * ```
   */
  get(type: PermissionType): PermissionStatus | null {
    const cached = this.cache.get(type);

    // Not in cache
    if (!cached) {
      return null;
    }

    // Check if expired
    const now = Date.now();
    const age = now - cached.timestamp;

    if (age > this.TTL) {
      // Expired - remove from cache and return null
      this.cache.delete(type);
      return null;
    }

    // Fresh - return cached status
    return cached.status;
  }

  /**
   * Set permission status in cache
   *
   * @param type - Permission type to cache
   * @param status - Permission status to cache
   *
   * @example
   * ```typescript
   * cache.set('notifications', {
   *   granted: true,
   *   requesting: false,
   *   lastChecked: Date.now(),
   *   error: null
   * });
   * ```
   */
  set(type: PermissionType, status: PermissionStatus): void {
    this.cache.set(type, {
      status,
      timestamp: Date.now(),
    });
  }

  /**
   * Check if permission is cached and fresh
   *
   * @param type - Permission type to check
   * @returns True if cached and fresh, false otherwise
   */
  has(type: PermissionType): boolean {
    return this.get(type) !== null;
  }

  /**
   * Invalidate cache for specific permission or all permissions
   *
   * @param type - Permission type to invalidate (if undefined, clears all)
   *
   * @example
   * ```typescript
   * // Invalidate specific permission
   * cache.invalidate('camera');
   *
   * // Invalidate all permissions
   * cache.invalidate();
   * ```
   */
  invalidate(type?: PermissionType): void {
    if (type) {
      this.cache.delete(type);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Get all cached permission types
   *
   * @returns Array of permission types currently cached
   */
  getCachedTypes(): PermissionType[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache statistics
   *
   * @returns Object with cache stats (useful for debugging)
   */
  getStats(): {
    size: number;
    ttlMs: number;
    entries: Array<{
      type: PermissionType;
      age: number;
      fresh: boolean;
    }>;
  } {
    const now = Date.now();
    const entries: Array<{
      type: PermissionType;
      age: number;
      fresh: boolean;
    }> = [];

    for (const [type, cached] of this.cache.entries()) {
      const age = now - cached.timestamp;
      entries.push({
        type,
        age,
        fresh: age <= this.TTL,
      });
    }

    return {
      size: this.cache.size,
      ttlMs: this.TTL,
      entries,
    };
  }

  /**
   * Clear all cached entries
   * Alias for invalidate() with no arguments
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   *
   * @returns Number of cached entries
   */
  size(): number {
    return this.cache.size;
  }
}

/**
 * Global permission cache instance
 * Singleton pattern ensures all permission checks use the same cache
 */
export const globalPermissionCache = new PermissionCache();
