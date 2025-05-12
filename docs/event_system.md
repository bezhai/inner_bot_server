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

## Redis Stream 动态分组与 Topic 事件系统设计

为满足业务中"每个 cardID 为一组，且每组下有不同 topic，事件需严格顺序消费"的需求，事件系统支持基于 Redis Stream 的动态分组与多 topic 机制。

### 设计要点

- **Stream Key 结构**：`event_stream:{topic}:{card_id}`，每个 topic+cardID 组合一个 Stream。
- **消费者组**：每个 Stream 拥有独立的消费者组，组名可用 `{topic}:{card_id}`。
- **事件顺序消费**：每个 cardID+topic 只分配一个消费协程，保证严格顺序。
- **处理函数路由**：不同 topic 路由到不同的事件处理函数。
- **动态注册/注销 group**：
  - 新的 cardID+topic 事件到来时，自动注册消费协程。
  - 消费完毕后，生产者可主动注销 group（如发布注销消息），消费者收到后及时释放资源。
  - 也可定期检测无事件的 group 自动注销。
- **毫秒级感知**：推荐通过 Redis PUB/SUB 机制，生产者在注册/注销 group 时发布通知，消费者订阅后毫秒级响应。

### 生产者示例

```python
async def produce(redis, topic, card_id, event_data: dict):
    stream_key = f"event_stream:{topic}:{card_id}"
    await redis.xadd(stream_key, event_data)
    # 注册 group 通知（可选）
    await redis.publish("group_change", f"register:{topic}:{card_id}")

# 主动注销 group
async def unregister_group(redis, topic, card_id):
    await redis.publish("group_change", f"unregister:{topic}:{card_id}")
```

### 消费者调度与处理

```python
TOPIC_HANDLERS = {
    "comment": handle_comment_event,
    "like": handle_like_event,
    # ...
}

async def consume_stream(redis, topic, card_id, consumer_name):
    stream_key = f"event_stream:{topic}:{card_id}"
    group_name = f"{topic}:{card_id}"
    try:
        await redis.xgroup_create(stream_key, group_name, id='0', mkstream=True)
    except Exception:
        pass
    handler = TOPIC_HANDLERS[topic]
    while True:
        events = await redis.xreadgroup(
            group_name, consumer_name,
            streams={stream_key: '>'},
            count=10, block=1000
        )
        if not events:
            continue
        for _, messages in events:
            for msg_id, msg in messages:
                try:
                    await handler(msg)
                    await redis.xack(stream_key, group_name, msg_id)
                except Exception as e:
                    print(f"处理失败: {e}")
```

### group 注册/注销机制

- 生产者在有新事件时发布 `register:{topic}:{card_id}`，在业务完成后可主动发布 `unregister:{topic}:{card_id}`。
- 消费者订阅 `group_change` 频道，收到注册消息后启动消费，收到注销消息后及时释放资源。
- 也可定期轮询 Redis Stream key，发现无事件的 group 自动注销。

### 适用场景

- 动态 group 数量大、事件需分组顺序消费
- 多 topic 路由不同处理逻辑
- 需毫秒级感知 group 变动、及时注册/注销

如需更详细的实现方案，请参考源码或联系维护者。
