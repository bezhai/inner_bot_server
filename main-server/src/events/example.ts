import { Subscribe, initEventSubscriptions, clearEventSubscriptions } from './index';

/**
 * 示例服务类，展示如何使用 @Subscribe 装饰器
 */
class ExampleService {
    /**
     * 使用 @Subscribe 装饰器订阅 'userCreated' 事件
     */
    @Subscribe('userCreated')
    handleUserCreated(data: any): void {
        console.log('收到用户创建事件:', data);
        // 处理用户创建逻辑
    }

    /**
     * 使用 @Subscribe 装饰器订阅 'messageReceived' 事件
     */
    @Subscribe('messageReceived')
    handleMessageReceived(data: any): void {
        console.log('收到消息事件:', data);
        // 处理消息接收逻辑
    }
}

/**
 * 延迟注册使用示例
 */
function exampleUsage(): void {
    // 创建服务实例
    const service = new ExampleService();
    console.log('服务已创建，但事件尚未注册');

    // 假设应用初始化，事件系统已经准备好
    console.log('应用初始化完成，事件系统准备就绪');

    // 此时初始化所有事件订阅
    initEventSubscriptions();
    console.log('所有事件已注册并生效');

    // ... 应用运行 ...

    // 应用关闭时，清除所有事件订阅
    clearEventSubscriptions();
    console.log('已清除所有事件订阅');
}

// 导出示例服务类和示例用法
export { ExampleService, exampleUsage };
