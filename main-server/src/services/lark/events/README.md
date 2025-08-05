# Lark事件处理器系统

## 概述

本系统使用基于装饰器的动态事件注册机制，替代了原有的手写事件处理器映射方式，大大减少了代码耦合，提高了可维护性。

## 核心组件

### 1. 事件注册表 (`EventRegistry`)

位于 `src/utils/event-registry.ts`，负责管理所有事件处理器的注册和查找。

主要功能：
- 注册事件处理器
- 根据事件类型查找处理器
- 管理事件类型到处理器的映射关系

### 2. 事件处理器装饰器 (`@EventHandler`)

用于标记类方法为事件处理器，支持单个事件或多个事件的注册。

```typescript
// 单个事件
@EventHandler('im.message.receive_v1')
async handleMessageReceive(params: LarkReceiveMessage): Promise<void> {
    // 处理逻辑
}

// 多个事件
@EventHandler(['im.message.reaction.created_v1', 'im.message.reaction.deleted_v1'])
async handleReaction(params: LarkOperateReactionInfo): Promise<void> {
    // 处理逻辑
}
```

### 3. 事件处理器类 (`LarkEventHandlers`)

位于 `src/services/lark/events/handlers.ts`，包含所有Lark事件的处理逻辑。

## 使用方法

### 添加新的事件处理器

1. 在 `LarkEventHandlers` 类中添加新方法
2. 使用 `@EventHandler` 装饰器标记方法
3. 实现处理逻辑

```typescript
export class LarkEventHandlers {
    @EventHandler('your.new.event.type')
    async handleNewEvent(params: YourEventType): Promise<void> {
        // 实现处理逻辑
    }
}
```

### 注册事件处理器实例

系统会在 `HttpRouterManager` 和 `WebSocketManager` 中自动注册事件处理器实例：

```typescript
// 自动注册（在Manager中调用）
registerEventHandlerInstance(larkEventHandlers);
```

### 获取注册的处理器

```typescript
// 根据事件类型获取处理器
const handler = EventRegistry.getHandlerByEventType('im.message.receive_v1');

// 获取所有注册的事件类型
const eventTypes = EventRegistry.getRegisteredEventTypes();
```

## 支持的事件类型

当前系统支持以下Lark事件类型：

| 事件类型 | 处理器方法 | 描述 |
|---------|-----------|------|
| `im.message.receive_v1` | `handleMessageReceive` | 消息接收 |
| `im.message.recalled_v1` | `handleMessageRecalled` | 消息撤回 |
| `card.action.trigger` | `handleCardAction` | 卡片动作 |
| `im.chat.member.user.added_v1` | `handleChatMemberAdd` | 群成员添加 |
| `im.chat.member.user.deleted_v1` | `handleChatMemberRemove` | 群成员删除 |
| `im.chat.member.user.withdrawn_v1` | `handleChatMemberRemove` | 群成员退出 |
| `im.chat.member.bot.added_v1` | `handleChatRobotAdd` | 机器人加入群 |
| `im.chat.member.bot.deleted_v1` | `handleChatRobotRemove` | 机器人离开群 |
| `im.message.reaction.created_v1` | `handleReaction` | 消息反应创建 |
| `im.message.reaction.deleted_v1` | `handleReaction` | 消息反应删除 |
| `im.chat.access_event.bot_p2p_chat_entered_v1` | `handlerEnterChat` | 进入私聊 |
| `im.chat.updated_v1` | `handleGroupChange` | 群信息更新 |

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                    装饰器注册系统                              │
├─────────────────────────────────────────────────────────────┤
│  @EventHandler装饰器                                         │
│  ├─ 存储元数据到eventHandlerMetadata                          │
│  └─ 标记方法为事件处理器                                       │
├─────────────────────────────────────────────────────────────┤
│  registerEventHandlerInstance()                             │
│  ├─ 扫描类实例的装饰器元数据                                   │
│  ├─ 创建绑定到实例的处理器函数                                 │
│  └─ 注册到EventRegistry                                      │
├─────────────────────────────────────────────────────────────┤
│  EventRegistry                                              │
│  ├─ handlers: Map<string, EventHandlerFunction>            │
│  ├─ eventTypeMap: Map<string, string>                      │
│  └─ 提供查找和管理接口                                        │
├─────────────────────────────────────────────────────────────┤
│  HttpRouterManager / WebSocketManager                      │
│  ├─ 初始化时注册事件处理器实例                                 │
│  ├─ 从EventRegistry获取处理器                                │
│  └─ 创建Lark EventDispatcher                               │
└─────────────────────────────────────────────────────────────┘
```

## 优势

### 1. 解耦合
- 不再需要手写 `eventHandlers` 常量
- 不再需要维护 `getEventHandlerMap()` 映射
- 事件类型和处理器通过装饰器自动关联

### 2. 类型安全
- 使用TypeScript装饰器提供编译时检查
- 明确的事件参数类型定义

### 3. 易于维护
- 新增事件处理器只需添加装饰器
- 集中管理所有事件处理逻辑
- 自动发现和注册机制

### 4. 向后兼容
- 完全兼容原有的事件类型
- 不影响现有的业务逻辑
- 平滑迁移路径

## 测试

系统提供了完整的测试套件：

```bash
# 测试基础装饰器功能
npx ts-node src/utils/event-registry.test.ts

# 测试Lark事件处理器
npx ts-node src/utils/test-lark-handlers.ts
```

## 迁移指南

### 从旧系统迁移

1. **移除旧的静态映射**：
   ```typescript
   // 旧方式 - 删除
   private static eventHandlers = {
       handleMessageReceive,
       handleMessageRecalled,
       // ...
   };
   ```

2. **使用新的动态注册**：
   ```typescript
   // 新方式
   registerEventHandlerInstance(larkEventHandlers);
   const handler = EventRegistry.getHandlerByEventType(eventType);
   ```

3. **更新事件处理器定义**：
   ```typescript
   // 旧方式 - 函数导出
   export async function handleMessageReceive(params: LarkReceiveMessage) {
       // ...
   }
   
   // 新方式 - 类方法 + 装饰器
   export class LarkEventHandlers {
       @EventHandler('im.message.receive_v1')
       async handleMessageReceive(params: LarkReceiveMessage): Promise<void> {
           // ...
       }
   }
   ```

## 注意事项

1. **装饰器执行时机**：装饰器在类定义时执行，元数据会立即存储
2. **实例注册**：必须调用 `registerEventHandlerInstance()` 才能将方法注册到事件注册表
3. **方法绑定**：系统会自动处理 `this` 绑定，确保方法在正确的实例上下文中执行
4. **重复注册**：同一事件类型的重复注册会覆盖之前的处理器

## 故障排除

### 常见问题

1. **装饰器不生效**
   - 确保 `tsconfig.json` 中启用了 `experimentalDecorators: true`
   - 检查装饰器语法是否正确

2. **处理器未找到**
   - 确保调用了 `registerEventHandlerInstance()`
   - 检查事件类型字符串是否正确

3. **方法执行错误**
   - 检查方法参数类型是否匹配
   - 确保异步方法正确处理错误