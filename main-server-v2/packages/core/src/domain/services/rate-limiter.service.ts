export interface RateLimiterConfig {
  maxRequests: number;
  windowMs: number;
  keyPrefix?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export interface RateLimiterService {
  /**
   * Check if a request is allowed based on rate limit
   * @param key Unique identifier for the rate limit (e.g., userId, chatId)
   * @param config Rate limit configuration
   * @returns Whether the request is allowed and remaining quota
   */
  checkLimit(key: string, config?: RateLimiterConfig): Promise<RateLimitResult>;

  /**
   * Reset the rate limit for a specific key
   * @param key Unique identifier for the rate limit
   */
  reset(key: string): Promise<void>;

  /**
   * Get current usage for a key
   * @param key Unique identifier for the rate limit
   * @returns Current count and reset time
   */
  getUsage(key: string): Promise<{
    count: number;
    resetAt: Date;
  }>;

  /**
   * Batch check multiple keys
   * @param keys Array of keys to check
   * @param config Rate limit configuration
   * @returns Map of key to rate limit result
   */
  batchCheck(
    keys: string[],
    config?: RateLimiterConfig
  ): Promise<Map<string, RateLimitResult>>;
}