# 事件系统

本项目实现了一个基于Redis的跨服务事件发布-订阅系统，支持两种模式：广播模式和请求-响应模式。

## 特性

- **支持两种事件模式**：
  - 广播模式：发布者不关心结果，任何订阅者都可以接收并处理
  - 请求-响应模式：发布者等待订阅者处理并返回结果
- **本地优先原则**：同一服务内优先使用本地事件机制，提高效率
- **服务隔离**：发布者和订阅者互不感知，降低耦合
- **消息超时**：自动处理消息超时，防止无限等待
- **跨语言支持**：同时支持Node.js和Python服务

## 使用方法

### Node.js (TypeScript)

```typescript
// 发布事件（广播模式）
import { publishEvent } from './events';

publishEvent('user.created', { 
  id: 123, 
  name: '张三' 
});

// 发布事件并等待结果（请求-响应模式）
import { publishEventAndWait } from './events';

try {
  const result = await publishEventAndWait('ai.request', {
    requestId: 'req-123',
    query: '如何使用事件系统？'
  });
  console.log('处理结果:', result);
} catch (error) {
  console.error('处理失败:', error);
}

// 订阅事件
import { getEventSystem } from './events';

const eventSystem = getEventSystem();
eventSystem.subscribe('user.action', async (data) => {
  console.log('收到用户行为事件:', data);
  // 处理逻辑...
  return { status: 'processed' };
});
```

### Python

```python
# 发布事件（广播模式）
from app.events import publish_event

await publish_event('data.update', {
    'table': 'users',
    'id': 123,
    'changes': {'name': '李四'}
})

# 发布事件并等待结果（请求-响应模式）
from app.events import publish_event_and_wait

try:
    result = await publish_event_and_wait('calculate.sum', [1, 2, 3, 4, 5])
    print(f"计算结果: {result}")
except Exception as e:
    print(f"处理失败: {e}")

# 订阅事件
from app.event_system import get_event_system

event_system = get_event_system()

@event_system.subscribe('data.process')
async def handle_data_process(data):
    print(f"收到数据处理事件: {data}")
    # 处理逻辑...
    return {'processed': True, 'result': 'success'}
```

## 配置

事件系统依赖Redis进行跨服务通信，需要在环境变量中设置Redis连接URL：

```
REDIS_URL=redis://localhost:6379
```

如果不设置此环境变量，或者不想使用Redis，事件系统将退化为本地事件处理模式。

## 事件超时

默认情况下，请求-响应模式的事件超时时间为30秒，可以在发布事件时自定义：

```typescript
// Node.js
await publishEventAndWait('slow.process', data, { ttl: 60000 }); // 60秒超时

// Python
await publish_event_and_wait('slow.process', data, ttl=60.0) # 60秒超时
```
