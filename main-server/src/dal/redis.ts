import Redis from 'ioredis';

// Redis配置选项
const redisConfig = {
    host: process.env.REDIS_IP || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
};

// 创建主Redis客户端
const redis = new Redis(redisConfig);

// 单独创建一个用于订阅的Redis客户端
// 因为在订阅模式下，客户端不能执行其他命令
const redisSub = new Redis(redisConfig);

redis.on('connect', () => {
    console.log(`Connected to Redis`);
});

redis.on('error', (err: Error) => {
    console.error('Redis connection error:', err);
});

redisSub.on('connect', () => {
    console.log(`Connected to Redis Subscriber`);
});

redisSub.on('error', (err: Error) => {
    console.error('Redis Subscriber connection error:', err);
});

// 存储频道订阅的处理函数
const channelHandlers: Map<string, Set<(channel: string, message: string) => void>> = new Map();

// 当订阅客户端收到消息时
redisSub.on('message', (channel: string, message: string) => {
    const handlers = channelHandlers.get(channel);
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

export async function incr(key: string): Promise<number> {
    return redis.incr(key);
}

export async function set(key: string, value: string) {
    return redis.set(key, value);
}

export async function setWithExpire(key: string, value: string, seconds: number) {
    return redis.set(key, value, 'EX', seconds);
}

export async function get(key: string): Promise<string | null> {
    return redis.get(key);
}

/**
 * 发布消息到Redis频道
 * @param channel 频道名
 * @param message 消息内容
 * @returns 接收消息的客户端数量
 */
export async function publish(channel: string, message: string): Promise<number> {
    return redis.publish(channel, message);
}

/**
 * 订阅Redis频道
 * @param channel 频道名
 * @param handler 消息处理函数
 */
export async function subscribe(
    channel: string,
    handler: (channel: string, message: string) => void,
): Promise<void> {
    // 如果是第一次订阅此频道，需要在Redis中订阅
    if (!channelHandlers.has(channel)) {
        channelHandlers.set(channel, new Set());
        await redisSub.subscribe(channel);
    }

    // 添加处理函数
    const handlers = channelHandlers.get(channel)!;
    handlers.add(handler);
}

/**
 * 取消订阅Redis频道
 * @param channel 频道名
 * @param handler 可选，指定要取消的处理函数。如果不指定，取消所有处理函数
 */
export async function unsubscribe(
    channel: string,
    handler?: (channel: string, message: string) => void,
): Promise<void> {
    if (!channelHandlers.has(channel)) {
        return;
    }

    const handlers = channelHandlers.get(channel)!;

    if (handler) {
        // 移除特定处理函数
        handlers.delete(handler);
    } else {
        // 移除所有处理函数
        handlers.clear();
    }

    // 如果没有更多处理函数，在Redis中取消订阅
    if (handlers.size === 0) {
        channelHandlers.delete(channel);
        await redisSub.unsubscribe(channel);
    }
}

/**
 * 使用模式订阅多个频道
 * @param pattern 频道模式，如 event:*
 * @param handler 消息处理函数
 */
export async function psubscribe(
    pattern: string,
    handler: (pattern: string, channel: string, message: string) => void,
): Promise<void> {
    // 先取消现有的pmessage监听器，避免重复监听
    redisSub.removeAllListeners('pmessage');
    
    // 订阅模式
    await redisSub.psubscribe(pattern);
    
    // 注册新的处理函数
    redisSub.on('pmessage', handler);
    
    console.log(`Redis: 已订阅模式 ${pattern}`);
}

/**
 * 取消模式订阅
 * @param pattern 频道模式
 */
export async function punsubscribe(pattern: string): Promise<void> {
    await redisSub.punsubscribe(pattern);
}

/**
 * 关闭Redis连接
 */
export async function close(): Promise<void> {
    await redis.quit();
    await redisSub.quit();
}
