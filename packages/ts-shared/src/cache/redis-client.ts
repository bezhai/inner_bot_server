import Redis from 'ioredis';

/**
 * Redis configuration options
 */
export interface RedisConfig {
    host: string;
    port: number;
    password?: string;
    retryStrategy?: (times: number) => number;
}

/**
 * Create default Redis configuration from environment variables
 */
export function createDefaultRedisConfig(): RedisConfig {
    return {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD,
        retryStrategy: (times: number) => {
            const delay = Math.min(times * 50, 2000);
            return delay;
        },
    };
}

/**
 * Redis client wrapper class
 */
export class RedisClient {
    private redis: Redis;
    private redisSub: Redis;
    private channelHandlers: Map<string, Set<(channel: string, message: string) => void>> = new Map();

    constructor(config: RedisConfig = createDefaultRedisConfig()) {
        this.redis = new Redis(config);
        this.redisSub = new Redis(config);

        this.redis.on('connect', () => {
            console.info('Connected to Redis');
        });

        this.redis.on('error', (err: Error) => {
            console.error('Redis connection error:', err);
        });

        this.redisSub.on('connect', () => {
            console.info('Connected to Redis Subscriber');
        });

        this.redisSub.on('error', (err: Error) => {
            console.error('Redis Subscriber connection error:', err);
        });

        this.redisSub.on('message', (channel: string, message: string) => {
            const handlers = this.channelHandlers.get(channel);
            if (handlers) {
                for (const handler of handlers) {
                    try {
                        handler(channel, message);
                    } catch (error) {
                        console.error(`Error in Redis message handler for channel ${channel}:`, error);
                    }
                }
            }
        });
    }

    async incr(key: string): Promise<number> {
        return this.redis.incr(key);
    }

    async set(key: string, value: string): Promise<'OK'> {
        return this.redis.set(key, value);
    }

    async setWithExpire(key: string, value: string, seconds: number): Promise<'OK'> {
        return this.redis.set(key, value, 'EX', seconds);
    }

    async get(key: string): Promise<string | null> {
        return this.redis.get(key);
    }

    async publish(channel: string, message: string): Promise<number> {
        return this.redis.publish(channel, message);
    }

    async subscribe(
        channel: string,
        handler: (channel: string, message: string) => void,
    ): Promise<void> {
        if (!this.channelHandlers.has(channel)) {
            this.channelHandlers.set(channel, new Set());
            await this.redisSub.subscribe(channel);
        }
        const handlers = this.channelHandlers.get(channel)!;
        handlers.add(handler);
    }

    async unsubscribe(
        channel: string,
        handler?: (channel: string, message: string) => void,
    ): Promise<void> {
        if (!this.channelHandlers.has(channel)) {
            return;
        }

        const handlers = this.channelHandlers.get(channel)!;

        if (handler) {
            handlers.delete(handler);
        } else {
            handlers.clear();
        }

        if (handlers.size === 0) {
            this.channelHandlers.delete(channel);
            await this.redisSub.unsubscribe(channel);
        }
    }

    async psubscribe(
        pattern: string,
        handler: (pattern: string, channel: string, message: string) => void,
    ): Promise<void> {
        this.redisSub.removeAllListeners('pmessage');
        await this.redisSub.psubscribe(pattern);
        this.redisSub.on('pmessage', handler);
        console.info(`Redis: subscribed to pattern ${pattern}`);
    }

    async punsubscribe(pattern: string): Promise<void> {
        await this.redisSub.punsubscribe(pattern);
    }

    async close(): Promise<void> {
        await this.redis.quit();
        await this.redisSub.quit();
    }

    async xadd(key: string, id: string, ...fieldValues: string[]): Promise<string> {
        // @ts-ignore
        const result = await this.redis.xadd(key, id, ...fieldValues);
        return result as string;
    }

    async xread(
        ...args: (string | number)[]
    ): Promise<Array<[string, Array<[string, string[]]>]> | null> {
        // @ts-ignore
        return (await this.redis.xread(...args)) as Array<[string, Array<[string, string[]]>]> | null;
    }

    async xdel(key: string, id: string): Promise<number> {
        return this.redis.xdel(key, id) as Promise<number>;
    }

    async xgroup(
        operation: string,
        key: string,
        groupName: string,
        id: string,
        mkstream = false,
    ): Promise<string> {
        const args: string[] = [operation, key, groupName, id];
        if (mkstream) {
            args.push('MKSTREAM');
        }
        // @ts-ignore
        const result = await this.redis.xgroup(...args);
        return result as string;
    }

    async xreadgroup(
        groupName: string,
        consumerName: string,
        ...args: (string | number)[]
    ): Promise<Array<[string, Array<[string, string[]]>]> | null> {
        // @ts-ignore
        return (await this.redis.xreadgroup('GROUP', groupName, consumerName, ...args)) as Array<
            [string, Array<[string, string[]]>]
        > | null;
    }

    async xack(key: string, groupName: string, id: string): Promise<number> {
        return this.redis.xack(key, groupName, id) as Promise<number>;
    }

    async del(...keys: string[]): Promise<number> {
        return this.redis.del(...keys);
    }

    async setNx(key: string, value: string, seconds?: number): Promise<'OK' | null> {
        if (seconds) {
            const result = await this.redis.call('SET', key, value, 'EX', seconds, 'NX');
            return result as 'OK' | null;
        } else {
            return this.redis.setnx(key, value).then((result) => (result === 1 ? 'OK' : null));
        }
    }

    async evalScript(
        script: string,
        numKeys: number,
        ...keysAndArgs: (string | number)[]
    ): Promise<unknown> {
        return this.redis.eval(script, numKeys, ...keysAndArgs);
    }

    async exists(key: string): Promise<number> {
        return this.redis.exists(key);
    }
}

// Default singleton instance
let defaultInstance: RedisClient | null = null;

export function getRedisClient(config?: RedisConfig): RedisClient {
    if (!defaultInstance) {
        defaultInstance = new RedisClient(config);
    }
    return defaultInstance;
}

export function resetRedisClient(): void {
    if (defaultInstance) {
        defaultInstance.close();
        defaultInstance = null;
    }
}
