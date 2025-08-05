import {
    EventRegistry,
    EventHandler,
    registerEventHandlerInstance,
    getEventHandlerMetadata,
} from './event-registry';

/**
 * 测试事件处理器类
 */
class TestEventHandlers {
    @EventHandler('test.event.single')
    async handleSingleEvent(params: any): Promise<void> {
        console.log('Handling single event:', params);
    }

    @EventHandler(['test.event.multiple1', 'test.event.multiple2'])
    async handleMultipleEvents(params: any): Promise<void> {
        console.log('Handling multiple events:', params);
    }

    async normalMethod(params: any): Promise<void> {
        console.log('Normal method (should not be registered):', params);
    }
}

/**
 * 测试装饰器注册系统
 */
export function testEventRegistrySystem(): void {
    console.log('=== 测试事件注册装饰器系统 ===');

    // 清空注册表
    EventRegistry.clear();

    // 创建测试实例
    const testHandlers = new TestEventHandlers();

    // 注册事件处理器
    console.log('1. 注册事件处理器实例...');
    registerEventHandlerInstance(testHandlers);

    // 检查元数据
    console.log('2. 检查装饰器元数据:');
    const metadata = getEventHandlerMetadata();
    metadata.forEach((data, key) => {
        console.log(`   ${key}: ${data.eventTypes.join(', ')}`);
    });

    // 检查注册表
    console.log('3. 检查事件注册表:');
    const eventTypeMap = EventRegistry.getEventTypeMap();
    eventTypeMap.forEach((handlerName, eventType) => {
        console.log(`   ${eventType} -> ${handlerName}`);
    });

    // 检查注册的事件类型
    console.log('4. 已注册的事件类型:');
    const registeredTypes = EventRegistry.getRegisteredEventTypes();
    registeredTypes.forEach((type) => {
        console.log(`   - ${type}`);
    });

    // 测试获取处理器
    console.log('5. 测试获取处理器:');
    const singleEventHandler = EventRegistry.getHandlerByEventType('test.event.single');
    const multipleEventHandler1 = EventRegistry.getHandlerByEventType('test.event.multiple1');
    const multipleEventHandler2 = EventRegistry.getHandlerByEventType('test.event.multiple2');
    const nonExistentHandler = EventRegistry.getHandlerByEventType('non.existent.event');

    console.log(`   test.event.single: ${singleEventHandler ? '✓ 找到' : '✗ 未找到'}`);
    console.log(`   test.event.multiple1: ${multipleEventHandler1 ? '✓ 找到' : '✗ 未找到'}`);
    console.log(`   test.event.multiple2: ${multipleEventHandler2 ? '✓ 找到' : '✗ 未找到'}`);
    console.log(`   non.existent.event: ${nonExistentHandler ? '✗ 意外找到' : '✓ 正确未找到'}`);

    // 测试处理器执行
    console.log('6. 测试处理器执行:');
    if (singleEventHandler) {
        singleEventHandler({ test: 'single event data' }).catch(console.error);
    }
    if (multipleEventHandler1) {
        multipleEventHandler1({ test: 'multiple event data 1' }).catch(console.error);
    }

    console.log('=== 测试完成 ===\n');
}

// 如果直接运行此文件，执行测试
if (require.main === module) {
    testEventRegistrySystem();
}
