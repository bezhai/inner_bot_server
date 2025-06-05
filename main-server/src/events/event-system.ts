import { EventEmitter } from 'node:events';
import { v4 as uuidv4 } from 'uuid';
// 导入已有的Redis实例
import * as redisClient from 'dal/redis';
// 导入 GroupStreamManager

// 事件数据结构
export interface EventData {
    id: string; // 事件唯一ID
    type: string; // 事件类型
    source: string; // 事件来源服务
    timestamp: number; // 事件发生时间戳
    groupId?: string; // 事件组ID，用于标记一组相关事件
    payload: any; // 事件负载数据
    expireAt?: number; // 事件过期时间戳
}

// 事件响应数据结构
export interface EventResponse {
    success: boolean; // 处理是否成功
    data?: any; // 响应数据
    error?: string; // 错误信息
}

// 事件处理函数类型
export type EventHandler = (data: any) => Promise<any> | any;

// 事件系统配置
export interface EventSystemConfig {
    serviceName: string; // 当前服务名称
    serviceId?: string; // 服务实例ID，默认自动生成
    defaultTTL?: number; // 默认消息过期时间(毫秒)
}

export class EventSystem {
    private eventEmitter: EventEmitter;
    private redisPubSub: boolean = false; // 是否启用Redis发布订阅
    private handlers: Map<string, EventHandler[]> = new Map();
    private responseHandlers: Map<
        string,
        {
            resolve: (value: any) => void;
            reject: (reason: any) => void;
            timeoutId: NodeJS.Timeout;
        }
    > = new Map();

    private serviceName: string;
    private serviceId: string;
    private defaultTTL: number;

    constructor(config: EventSystemConfig) {
        this.eventEmitter = new EventEmitter();
        this.serviceName = config.serviceName;
        this.serviceId = config.serviceId || uuidv4();
        this.defaultTTL = config.defaultTTL || 30000; // 默认30秒

        // 设置Redis发布订阅监听
        this.setupRedisPubSub();
    }

    /**
     * 设置Redis发布订阅监听
     */
    private setupRedisPubSub(): void {
        try {
            // 确保已有Redis客户端存在并可用
            if (redisClient) {
                // 使用模式订阅来监听所有事件频道
                redisClient
                    .psubscribe('event:*', this.handleRedisPMessage.bind(this))
                    .then(() => {
                        this.redisPubSub = true;
                        console.log(
                            `[EventSystem] Redis发布订阅监听已设置，服务ID: ${this.serviceId}`,
                        );
                    })
                    .catch((err) => {
                        console.error('[EventSystem] 设置Redis发布订阅失败:', err);
                        this.redisPubSub = false;
                    });
            }
        } catch (error) {
            console.error('[EventSystem] 设置Redis发布订阅失败:', error);
            this.redisPubSub = false;
        }
    }

    /**
     * 处理从Redis接收到的模式匹配消息
     */
    private async handleRedisPMessage(
        pattern: string,
        channel: string,
        message: string,
    ): Promise<void> {
        await this.handleRedisMessage(channel, message);
    }

    /**
     * 处理从Redis接收到的消息
     */
    private async handleRedisMessage(channel: string, message: string): Promise<void> {
        try {
            const eventData: EventData = JSON.parse(message);

            // 忽略自己发出的事件，防止循环处理
            if (eventData.source === this.serviceId) return;

            // 检查事件是否过期
            if (eventData.expireAt && eventData.expireAt < Date.now()) {
                console.log(`[EventSystem] 事件已过期: ${eventData.id}`);
                return;
            }

            // 频道名称格式: event:类型:请求/响应
            const [prefix, eventType, mode] = channel.split(':');

            // 处理响应消息
            if (mode === 'response') {
                const requestId = eventData.groupId;
                if (!requestId) return;

                const handler = this.responseHandlers.get(requestId);
                if (handler) {
                    const response = eventData.payload as EventResponse;
                    if (response.success) {
                        handler.resolve(response.data);
                    } else {
                        handler.reject(new Error(response.error || '未知错误'));
                    }

                    clearTimeout(handler.timeoutId);
                    this.responseHandlers.delete(requestId);
                }
                return;
            }

            // 处理请求消息
            const handlers = this.handlers.get(eventType) || [];
            for (const handler of handlers) {
                try {
                    const result = await Promise.resolve(handler(eventData.payload));

                    // 如果是请求-响应模式，发送响应
                    if (mode === 'request' && eventData.id) {
                        const responseChannel = `event:${eventType}:response`;
                        const responseData: EventData = {
                            id: uuidv4(),
                            type: eventType,
                            source: this.serviceId,
                            timestamp: Date.now(),
                            groupId: eventData.id, // 使用原始请求ID作为groupId
                            payload: {
                                success: true,
                                data: result,
                            },
                        };

                        // 使用Redis发布消息
                        await this.publishToRedis(responseChannel, JSON.stringify(responseData));
                    }
                } catch (error) {
                    console.error(`[EventSystem] 处理事件 ${eventType} 时出错:`, error);

                    // 如果是请求-响应模式，发送错误响应
                    if (mode === 'request' && eventData.id) {
                        const responseChannel = `event:${eventType}:response`;
                        const responseData: EventData = {
                            id: uuidv4(),
                            type: eventType,
                            source: this.serviceId,
                            timestamp: Date.now(),
                            groupId: eventData.id,
                            payload: {
                                success: false,
                                error: error instanceof Error ? error.message : String(error),
                            },
                        };

                        // 使用Redis发布消息
                        await this.publishToRedis(responseChannel, JSON.stringify(responseData));
                    }
                }
            }
        } catch (error) {
            console.error('[EventSystem] 处理Redis消息失败:', error);
        }
    }

    /**
     * 发布消息到Redis
     * @param channel 频道名
     * @param message 消息内容
     */
    private async publishToRedis(channel: string, message: string): Promise<void> {
        try {
            await redisClient.publish(channel, message);
        } catch (error) {
            console.error(`[EventSystem] 发布消息到Redis失败 (channel: ${channel}):`, error);
        }
    }

    /**
     * 订阅Redis频道
     * @param channel 频道名
     */
    private async subscribeToRedis(channel: string): Promise<void> {
        try {
            // 虽然使用了模式订阅，但是对于特定频道也可以单独订阅以提高效率
            // 特别是当处理大量事件类型时
            if (this.redisPubSub && !channel.includes('*')) {
                await redisClient.subscribe(channel, this.handleRedisMessage.bind(this));
                console.log(`[EventSystem] 已订阅Redis频道: ${channel}`);
            }
        } catch (error) {
            console.error(`[EventSystem] 订阅Redis频道失败 (channel: ${channel}):`, error);
        }
    }

    /**
     * 取消订阅Redis频道
     * @param channel 频道名
     */
    private async unsubscribeFromRedis(channel: string): Promise<void> {
        try {
            // 对于单独订阅的频道，取消订阅
            if (this.redisPubSub && !channel.includes('*')) {
                await redisClient.unsubscribe(channel);
                console.log(`[EventSystem] 已取消订阅Redis频道: ${channel}`);
            }
        } catch (error) {
            console.error(`[EventSystem] 取消订阅Redis频道失败 (channel: ${channel}):`, error);
        }
    }

    /**
     * 订阅事件
     * @param eventType 事件类型
     * @param handler 事件处理函数
     */
    public subscribe(eventType: string, handler: EventHandler): void {
        // 存储本地处理函数
        if (!this.handlers.has(eventType)) {
            this.handlers.set(eventType, []);
        }
        this.handlers.get(eventType)?.push(handler);

        // 同时监听本地事件
        this.eventEmitter.on(eventType, handler);
        console.log(`[EventSystem] 已订阅本地事件: ${eventType}`);

        // 如果启用了Redis，确保也订阅Redis频道
        if (this.redisPubSub) {
            const channel = `event:${eventType}:request`;
            this.subscribeToRedis(channel).catch((error) =>
                console.error(`[EventSystem] Redis订阅失败 (${eventType}):`, error),
            );
        }

        console.log(`[EventSystem] 已订阅事件: ${eventType}`);
    }

    /**
     * 取消订阅事件
     * @param eventType 事件类型
     * @param handler 事件处理函数
     */
    public unsubscribe(eventType: string, handler?: EventHandler): void {
        // 移除本地处理函数
        if (handler) {
            const handlers = this.handlers.get(eventType) || [];
            this.handlers.set(
                eventType,
                handlers.filter((h) => h !== handler),
            );

            // 移除本地事件监听
            this.eventEmitter.off(eventType, handler);
        } else {
            this.handlers.delete(eventType);

            // 移除所有本地事件监听
            this.eventEmitter.removeAllListeners(eventType);

            // 如果启用了Redis且没有处理函数，取消订阅Redis频道
            if (this.redisPubSub) {
                const channel = `event:${eventType}:request`;
                this.unsubscribeFromRedis(channel).catch((error) =>
                    console.error(`[EventSystem] 取消Redis订阅失败 (${eventType}):`, error),
                );
            }
        }

        console.log(`[EventSystem] 已取消订阅事件: ${eventType}`);
    }

    /**
     * 广播模式：发布事件，不等待结果
     * @param eventType 事件类型
     * @param data 事件数据
     * @param options 发布选项
     */
    public publish(
        eventType: string,
        data: any,
        options: {
            groupId?: string;
            ttl?: number;
            localOnly?: boolean;
            forceDistributed?: boolean; // 新增选项：强制分布式处理
        } = {},
    ): void {
        const eventId = uuidv4();
        const timestamp = Date.now();
        const {
            groupId,
            ttl = this.defaultTTL,
            localOnly = false,
            forceDistributed = false, // 默认不强制分布式处理
        } = options;

        // 创建事件数据
        const eventData: EventData = {
            id: eventId,
            type: eventType,
            source: this.serviceId,
            timestamp,
            groupId,
            payload: data,
            expireAt: timestamp + ttl,
        };

        const hasLocalHandlers = this.eventEmitter.listenerCount(eventType) > 0;

        // 决定消息处理方式
        if (hasLocalHandlers && !forceDistributed) {
            // 如果有本地处理器且不强制分布式，优先在本地处理
            this.eventEmitter.emit(eventType, data);
            console.log(`[EventSystem] 事件在本地处理: ${eventType}`);
        } else if (!localOnly && this.redisPubSub) {
            // 如果没有本地处理器或强制分布式，且不是本地专用，则通过Redis分发
            const channel = `event:${eventType}:request`;
            this.publishToRedis(channel, JSON.stringify(eventData));
            console.log(`[EventSystem] 事件通过Redis分发: ${eventType}`);
        } else if (hasLocalHandlers) {
            // 作为后备，如果Redis不可用但有本地处理器
            this.eventEmitter.emit(eventType, data);
            console.log(`[EventSystem] 事件在本地处理(Redis不可用): ${eventType}`);
        } else {
            console.warn(`[EventSystem] 事件没有处理器: ${eventType}`);
        }
    }

    /**
     * 请求-响应模式：发布事件并等待结果
     * @param eventType 事件类型
     * @param data 事件数据
     * @param options 发布选项
     * @returns Promise<any> 处理结果
     */
    public async publishAndWait(
        eventType: string,
        data: any,
        options: {
            groupId?: string;
            ttl?: number;
            localOnly?: boolean;
            forceDistributed?: boolean; // 新增选项：强制分布式处理
        } = {},
    ): Promise<any> {
        const eventId = uuidv4();
        const timestamp = Date.now();
        const {
            groupId,
            ttl = this.defaultTTL,
            localOnly = false,
            forceDistributed = false,
        } = options;

        // 创建事件数据
        const eventData: EventData = {
            id: eventId,
            type: eventType,
            source: this.serviceId,
            timestamp,
            groupId,
            payload: data,
            expireAt: timestamp + ttl,
        };

        const hasLocalHandlers = this.eventEmitter.listenerCount(eventType) > 0;

        // 如果有本地处理器且不强制分布式，优先在本地处理
        if (hasLocalHandlers && !forceDistributed) {
            try {
                // 处理本地事件，收集所有结果
                const listeners = this.eventEmitter.listeners(eventType) as EventHandler[];
                for (const listener of listeners) {
                    const result = await Promise.resolve(listener(data));
                    console.log(`[EventSystem] 事件${eventType}在本地处理并等待结果`);
                    return result; // 返回第一个处理器的结果
                }
            } catch (error) {
                console.error(`[EventSystem] 处理本地事件 ${eventType} 时出错:`, error);
                throw error;
            }
        }

        // 如果需要通过Redis处理（没有本地处理器或强制分布式）
        if (!localOnly && this.redisPubSub) {
            console.log(`[EventSystem] 事件${eventType}通过Redis分发并等待结果`);

            if (!this.redisPubSub) {
                throw new Error('Redis发布订阅未启用，无法执行远程请求-响应');
            }

            return new Promise((resolve, reject) => {
                // 设置超时处理
                const timeoutId = setTimeout(() => {
                    this.responseHandlers.delete(eventId);
                    reject(new Error(`处理事件 ${eventType} 超时`));
                }, ttl);

                // 存储响应处理器
                this.responseHandlers.set(eventId, { resolve, reject, timeoutId });

                // 发布请求到请求频道
                const requestChannel = `event:${eventType}:request`;
                this.publishToRedis(requestChannel, JSON.stringify(eventData));
            });
        } else if (hasLocalHandlers) {
            // 作为后备，如果Redis不可用但有本地处理器
            try {
                const listeners = this.eventEmitter.listeners(eventType) as EventHandler[];
                for (const listener of listeners) {
                    const result = await Promise.resolve(listener(data));
                    console.log(`[EventSystem] 事件${eventType}在本地处理并等待结果(Redis不可用)`);
                    return result;
                }
            } catch (error) {
                console.error(`[EventSystem] 处理本地事件 ${eventType} 时出错:`, error);
                throw error;
            }
        }

        throw new Error(`没有可用的事件处理器: ${eventType}`);
    }

    /**
     * 关闭事件系统
     */
    public async close(): Promise<void> {
        try {
            // 清理所有超时计时器
            for (const { timeoutId } of this.responseHandlers.values()) {
                clearTimeout(timeoutId);
            }
            this.responseHandlers.clear();

            // 移除所有事件监听器
            this.eventEmitter.removeAllListeners();

            // 取消Redis模式订阅和所有单独订阅的频道
            if (this.redisPubSub) {
                try {
                    // 取消模式订阅
                    await redisClient.punsubscribe('event:*');
                    console.log('[EventSystem] 已取消Redis模式订阅');

                    // 获取所有已订阅事件类型
                    const eventTypes = Array.from(this.handlers.keys());

                    // 取消每个事件类型的Redis订阅
                    for (const eventType of eventTypes) {
                        const channel = `event:${eventType}:request`;
                        await this.unsubscribeFromRedis(channel);
                    }
                } catch (error) {
                    console.error('[EventSystem] 取消Redis订阅失败:', error);
                }
            }

            // 清空处理函数
            this.handlers.clear();

            console.log('[EventSystem] 事件系统已关闭');
        } catch (error) {
            console.error('[EventSystem] 关闭事件系统失败:', error);
        }
    }
}

// 导出单例实例
let eventSystem: EventSystem | null = null;

/**
 * 初始化事件系统
 * @param config 配置选项
 */
export function initEventSystem(config: EventSystemConfig): EventSystem {
    if (eventSystem) {
        throw new Error('事件系统已初始化');
    }

    eventSystem = new EventSystem(config);
    return eventSystem;
}

/**
 * 获取事件系统实例
 */
export function getEventSystem(): EventSystem {
    if (!eventSystem) {
        throw new Error('事件系统尚未初始化，请先调用 initEventSystem');
    }

    return eventSystem;
}
