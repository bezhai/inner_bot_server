export class RateLimiter {
  private rate: number; // 最大请求数
  private interval: number; // 时间窗口（毫秒）
  private queue: number[]; // 存储请求的时间戳

  constructor(rate: number, interval: number) {
    this.rate = rate;
    this.interval = interval;
    this.queue = [];
  }

  // 清理过期的请求记录
  private cleanup(now: number): void {
    while (this.queue.length > 0 && now - this.queue[0] > this.interval) {
      this.queue.shift();
    }
  }

  // 等待被允许执行
  public async waitForAllowance(timeout: number): Promise<boolean> {
    const now = Date.now();
    this.cleanup(now);

    // 如果当前请求数低于速率限制，直接允许
    if (this.queue.length < this.rate) {
      this.queue.push(now);
      return true;
    }

    // 启动一个定时器，以等待超时
    return new Promise((resolve) => {
      const startTime = Date.now();

      const attempt = () => {
        const now = Date.now();
        this.cleanup(now);

        if (this.queue.length < this.rate) {
          this.queue.push(now);
          resolve(true);
        } else if (now - startTime >= timeout) {
          resolve(false); // 超时
        } else {
          // 尝试再次检查
          setTimeout(attempt, 50); // 每隔 50ms 检查一次
        }
      };

      attempt();
    });
  }
}
