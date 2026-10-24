export class RequestLimiter {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly limit = 4) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error('maxConcurrentRequests must be a positive integer.');
    }
  }

  async acquire(signal?: AbortSignal): Promise<() => void> {
    signal?.throwIfAborted();
    if (this.active >= this.limit) {
      await new Promise<void>((resolve, reject) => {
        const ready = () => {
          signal?.removeEventListener('abort', abort);
          resolve();
        };
        const abort = () => {
          const index = this.queue.indexOf(ready);
          if (index !== -1) this.queue.splice(index, 1);
          reject(signal?.reason ?? new Error('Request aborted'));
        };
        this.queue.push(ready);
        signal?.addEventListener('abort', abort, { once: true });
      });
      // A slot is transferred directly from the previous request.
    } else {
      this.active++;
    }
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      const next = this.queue.shift();
      if (next) next();
      else this.active--;
    };
    if (signal?.aborted) {
      release();
      signal.throwIfAborted();
    }
    return release;
  }
}
