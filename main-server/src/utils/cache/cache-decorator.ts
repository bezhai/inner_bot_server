import { get as redisGet, setWithExpire as redisSetWithExpire } from 'dal/redis';

interface CacheOptions {
    type: 'local' | 'redis';
    ttl: number; // 秒
}

// 简单本地缓存实现
const localCache = new Map<string, { value: any; expire: number }>();

function genCacheKey(fnName: string, args: any[]): string {
    return `${fnName}:${JSON.stringify(args)}`;
}

/**
 * 通用缓存装饰器，支持本地缓存和 Redis 缓存
 * @param options 缓存选项
 */
export function cache(options: CacheOptions) {
    const { type, ttl } = options;
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;
        descriptor.value = async function (...args: any[]) {
            const key = genCacheKey(propertyKey, args);
            const now = Date.now();
            if (type === 'local') {
                const cached = localCache.get(key);
                if (cached && cached.expire > now) {
                    return cached.value;
                }
                const result = await originalMethod.apply(this, args);
                localCache.set(key, { value: result, expire: now + ttl * 1000 });
                return result;
            } else if (type === 'redis') {
                const cached = await redisGet(key);
                if (cached !== null) {
                    try {
                        return JSON.parse(cached);
                    } catch {
                        // fallback
                        return cached;
                    }
                }
                const result = await originalMethod.apply(this, args);
                await redisSetWithExpire(key, JSON.stringify(result), ttl);
                return result;
            } else {
                // 不支持的类型
                return await originalMethod.apply(this, args);
            }
        };
        return descriptor;
    };
}
