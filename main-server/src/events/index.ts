import { initEventSystem, getEventSystem } from './event-system';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

// 初始化事件系统
export const initEvents = () => {
    try {
        initEventSystem({
            serviceName: 'main-server',
            defaultTTL: 30000, // 30秒
        });

        console.log('[Events] 事件系统已初始化');
        return true;
    } catch (error) {
        console.error('[Events] 初始化事件系统失败:', error);
        return false;
    }
};

// 导出事件系统实例获取函数
export { getEventSystem };

// 导出便捷函数
/**
 * 发布事件（广播模式）
 * @param eventType 事件类型
 * @param data 事件数据
 * @param options 可选项
 *   - groupId: 事件组ID
 *   - ttl: 事件超时时间(毫秒)
 *   - localOnly: 是否仅本地处理
 *   - forceDistributed: 是否强制分布式处理（即使有本地处理器也通过Redis分发）
 */
export const publishEvent = (eventType: string, data: any, options = {}) => {
    const eventSystem = getEventSystem();
    eventSystem.publish(eventType, data, options);
};

/**
 * 发布事件并等待结果（请求-响应模式）
 * @param eventType 事件类型
 * @param data 事件数据
 * @param options 可选项
 *   - groupId: 事件组ID
 *   - ttl: 事件超时时间(毫秒)
 *   - localOnly: 是否仅本地处理
 *   - forceDistributed: 是否强制分布式处理（即使有本地处理器也通过Redis分发）
 * @returns Promise<any> 处理结果
 */
export const publishEventAndWait = async (eventType: string, data: any, options = {}) => {
    const eventSystem = getEventSystem();
    return await eventSystem.publishAndWait(eventType, data, options);
};

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
