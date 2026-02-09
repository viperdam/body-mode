// Permission Mutex - Prevents race conditions during permission checks
// Implements a queue-based mutex pattern to ensure only one permission check runs at a time

/**
 * Mutex for coordinating permission checks and preventing race conditions
 *
 * Pattern:
 * - Only one operation can hold the mutex at a time
 * - Subsequent operations are queued and executed sequentially
 * - Ensures consistent state when multiple components check permissions simultaneously
 */
export class PermissionMutex {
  /** Whether mutex is currently held */
  private locked = false;

  /** Queue of pending operations */
  private queue: Array<() => Promise<void>> = new Array<() => Promise<void>>();

  /**
   * Acquire mutex and execute function
   * If mutex is held, operation is queued until mutex is released
   *
   * @param fn - Async function to execute while holding mutex
   * @returns Promise that resolves when function completes
   *
   * @example
   * ```typescript
   * const mutex = new PermissionMutex();
   *
   * await mutex.acquire(async () => {
   *   const status = await checkPermission();
   *   updateStore(status);
   * });
   * ```
   */
  async acquire<T>(fn: () => Promise<T>): Promise<T> {
    // If mutex is already locked, queue this operation
    if (this.locked) {
      return new Promise((resolve, reject) => {
        this.queue.push(async () => {
          try {
            const result = await fn();
            resolve(result);
          } catch (error) {
            reject(error);
          }
        });
      });
    }

    // Acquire mutex
    this.locked = true;

    try {
      // Execute the function
      const result = await fn();

      // Process queued operations
      await this.processQueue();

      return result;
    } catch (error) {
      // Process queue even on error
      await this.processQueue();
      throw error;
    } finally {
      // Always release mutex
      this.locked = false;
    }
  }

  /**
   * Process all queued operations sequentially
   * Each operation runs to completion before next one starts
   */
  private async processQueue(): Promise<void> {
    while (this.queue.length > 0) {
      const nextOperation = this.queue.shift();
      if (nextOperation) {
        try {
          await nextOperation();
        } catch (error) {
          // Log error but continue processing queue
          console.error('[PermissionMutex] Queued operation failed:', error);
        }
      }
    }
  }

  /**
   * Check if mutex is currently locked
   * Useful for debugging and testing
   */
  isLocked(): boolean {
    return this.locked;
  }

  /**
   * Get number of queued operations
   * Useful for debugging and testing
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Clear all queued operations
   * Use with caution - should only be called during cleanup
   */
  clearQueue(): void {
    this.queue = [];
  }

  /**
   * Force release mutex
   * Use with caution - only for emergency cleanup
   * May leave operations in queue unprocessed
   */
  forceRelease(): void {
    this.locked = false;
    this.queue = [];
  }
}

/**
 * Create a global mutex instance for permission operations
 * Singleton pattern ensures all permission checks use the same mutex
 */
export const globalPermissionMutex = new PermissionMutex();
