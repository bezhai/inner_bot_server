import { getEventSystem } from './event-system';

// 存储待注册的事件处理函数
interface PendingHandler {
    eventType: string;
    handler: (data: any) => any;
    target: any;
}

// 全局存储所有待注册的事件处理函数
const pendingHandlers: PendingHandler[] = [];

// 标记是否已经初始化
let isInitialized = false;

/**
 * 订阅事件
 * @param eventType 事件类型
 * @param handler 事件处理函数
 */
export const subscribeEvent = (eventType: string, handler: (data: any) => Promise<any> | any) => {
    const eventSystem = getEventSystem();
    eventSystem.subscribe(eventType, handler);
};

/**
 * 取消订阅事件
 * @param eventType 事件类型
 * @param handler 可选，指定要取消的处理函数。如果不指定，取消所有处理函数
 */
export const unsubscribeEvent = (
    eventType: string,
    handler?: (data: any) => Promise<any> | any,
) => {
    const eventSystem = getEventSystem();
    eventSystem.unsubscribe(eventType, handler);
};

/**
 * 事件订阅装饰器
 *
 * 使用方式:
 * @Subscribe('eventName')
 * handleEvent(data: any) {
 *   // 处理事件逻辑
 * }
 *
 * @param eventType 事件类型名称
 */
export function Subscribe(eventType: string) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        // 保存原始方法
        const originalMethod = descriptor.value;

        // 替换为新方法并绑定this
        descriptor.value = function (this: any, ...args: any[]) {
            return originalMethod.apply(this, args);
        };

        // 生成处理函数
        const handler = function (this: any, ...args: any[]) {
            return originalMethod.apply(this, args);
        };

        // 获取类名
        const className = target.constructor.name;

        // 将处理函数添加到待注册列表
        pendingHandlers.push({
            eventType,
            handler,
            target: target.constructor,
        });

        console.log(`[${className}] 已添加事件处理函数: ${eventType}，等待初始化注册`);

        return descriptor;
    };
}

/**
 * 初始化所有事件订阅
 * 在事件系统准备好后调用此方法
 */
export function initEventSubscriptions(): void {
    if (isInitialized) {
        console.log('事件订阅已经初始化，跳过');
        return;
    }

    console.log(`开始注册 ${pendingHandlers.length} 个事件处理函数`);

    for (const { eventType, handler } of pendingHandlers) {
        subscribeEvent(eventType, handler);
        console.log(`已注册事件: ${eventType}`);
    }

    isInitialized = true;
}

/**
 * 取消所有事件订阅
 */
export function clearEventSubscriptions(): void {
    for (const { eventType, handler } of pendingHandlers) {
        unsubscribeEvent(eventType, handler);
        console.log(`已取消事件订阅: ${eventType}`);
    }

    // 清空待注册列表
    pendingHandlers.length = 0;
    isInitialized = false;
}
