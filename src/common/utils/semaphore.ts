/**
 * A minimal, dependency-free counting semaphore.
 *
 * `acquire` resolves immediately if a permit is free, otherwise it queues the
 * caller (FIFO) until a permit is released. `runWithLimit` is a convenience
 * wrapper that acquires, runs the task, and always releases.
 */
export class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise<void>((resolve) => this.queue.push(resolve));
  }

  release(): void {
    this.permits++;
    const next = this.queue.shift();
    if (next) {
      this.permits--;
      next();
    }
  }

  async runWithLimit<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}
