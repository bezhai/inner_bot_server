import { Subscribe } from './index';
import { registerGroup, unregisterGroup, publishGroupEvent } from './group-stream';
import { publish } from '../dal/redis';

// 1. 注册 handler（使用 @Subscribe 装饰器）
class OrderEventHandlers {
    @Subscribe('order.created')
    async handleOrderCreated(data: any) {
        console.log('[GroupStream Example] 收到 order.created 事件:', data);
    }
}


// 2. 注册分组（启动分组消费）
async function startOrderProcessing(groupId: string) {
    await registerGroup('order.created', groupId);
    console.log(`[GroupStream Example] 已注册分组: order.created:${groupId}`);
}

// 3. 取消分组（停止分组消费）
async function stopOrderProcessing(groupId: string) {
    await unregisterGroup('order.created', groupId);
    console.log(`[GroupStream Example] 已注销分组: order.created:${groupId}`);
}

// 4. 发布分组事件
async function createOrder(groupId: string, order: any) {
    await publishGroupEvent('order.created', groupId, order);
    console.log(`[GroupStream Example] 已发布订单创建事件到 group:${groupId}`);
}

// 示例调用
(async () => {
    const groupId = 'group_123';
    await startOrderProcessing(groupId);
    await createOrder(groupId, { orderId: 1, userId: 2 });
    // await stopOrderProcessing(groupId); // 如需注销可取消注释
})();
