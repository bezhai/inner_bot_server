import { Mutex } from 'async-mutex';

export class RateLimiter {
  private rate: number;
  private interval: number;
  private queue: number[];
  private mutex: Mutex;

  constructor(rate: number, interval: number) {
    this.rate = rate;
    this.interval = interval;
    this.queue = [];
    this.mutex = new Mutex();
  }

  private cleanup(now: number): void {
    while (this.queue.length > 0 && now - this.queue[0] > this.interval) {
      this.queue.shift();
    }
  }

  public async waitForAllowance(timeout: number): Promise<boolean> {
    const now = Date.now();
    const release = await this.mutex.acquire();

    try {
      this.cleanup(now);

      if (this.queue.length < this.rate) {
        this.queue.push(now);
        return true;
      }

      const startTime = Date.now();
      const waitTime = this.queue[0] + this.interval - now;

      if (waitTime > timeout) {
        return false;
      }

      return new Promise((resolve) => {
        setTimeout(async () => {
          const now = Date.now();
          await this.mutex.runExclusive(() => {
            this.cleanup(now);
            if (this.queue.length < this.rate) {
              this.queue.push(now);
              resolve(true);
            } else {
              resolve(false);
            }
          });
        }, waitTime);
      });
    } finally {
      release();
    }
  }
}
