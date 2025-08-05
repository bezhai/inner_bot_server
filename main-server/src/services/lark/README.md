# Lark 服务模块 (Lark Service Module)

Lark 服务模块负责管理与飞书平台的集成，提供模块化的事件处理、路由管理和 WebSocket 连接管理。

## 模块结构

```
services/lark/
├── router.ts              # HTTP 路由管理
├── websocket.ts           # WebSocket 连接管理
├── startup-strategy.ts    # 启动策略管理
├── events/               # 事件处理器
│   ├── service.ts        # 服务入口（已重构为兼容层）
│   ├── receive.ts        # 消息接收处理
│   ├── card.ts           # 卡片交互处理
│   ├── group.ts          # 群组事件处理
│   ├── reaction.ts       # 表情回应处理
│   └── ...
├── basic/                # 基础飞书操作
│   ├── message.ts        # 消息发送
│   ├── group.ts          # 群组管理
│   └── card-manager.ts   # 卡片管理
└── README.md             # 本文档
```

## 核心组件

### HttpRouterManager

HTTP 路由管理器，负责创建和管理 HTTP 模式下的事件路由。

```typescript
import { HttpRouterManager } from './services/lark/router';

// 为单个机器人创建路由配置
const routerConfig = HttpRouterManager.createRouterConfig(botConfig);

// 批量创建多个机器人的路由配置
const routerConfigs = HttpRouterManager.createMultipleRouterConfigs(botConfigs);
```

**主要功能：**
- 动态事件处理器映射
- 自动路由适配器生成
- 卡片动作处理器创建
- 批量路由配置管理

### WebSocketManager

WebSocket 客户端管理器，负责创建和管理 WebSocket 模式下的事件处理。

```typescript
import { WebSocketManager } from './services/lark/websocket';

// 启动单个机器人的 WebSocket 连接
WebSocketManager.startWebSocketForBot(botConfig);

// 批量启动多个机器人的 WebSocket 连接
WebSocketManager.startMultipleWebSockets(botConfigs);
```

**主要功能：**
- WebSocket 事件分发器创建
- 客户端连接管理
- 上下文注入支持
- 批量连接管理

### StartupStrategyManager

启动策略管理器，使用策略模式管理不同初始化类型的启动逻辑。

```typescript
import { StartupStrategyManager } from './services/lark/startup-strategy';

// 执行指定类型的启动策略
const result = await StartupStrategyManager.executeStrategy('http', botConfigs);

// 批量执行多种启动策略
const results = await StartupStrategyManager.executeMultipleStrategies([
    { initType: 'http', botConfigs: httpBots },
    { initType: 'websocket', botConfigs: wsBots }
]);
```

**支持的策略：**
- `http`: HTTP 路由初始化策略
- `websocket`: WebSocket 连接初始化策略

## 事件处理

### 支持的事件类型

```typescript
const eventMap = {
    'im.message.receive_v1': 'handleMessageReceive',
    'im.message.recalled_v1': 'handleMessageRecalled',
    'im.chat.member.user.added_v1': 'handleChatMemberAdd',
    'im.chat.member.user.deleted_v1': 'handleChatMemberRemove',
    'im.chat.member.user.withdrawn_v1': 'handleChatMemberRemove',
    'im.chat.member.bot.added_v1': 'handleChatRobotAdd',
    'im.chat.member.bot.deleted_v1': 'handleChatRobotRemove',
    'im.message.reaction.created_v1': 'handleReaction',
    'im.message.reaction.deleted_v1': 'handleReaction',
    'im.chat.access_event.bot_p2p_chat_entered_v1': 'handlerEnterChat',
    'im.chat.updated_v1': 'handleGroupChange',
    'card.action.trigger': 'handleCardAction',
};
```

### 事件处理器

每个事件处理器都位于 `events/` 目录下：

- **receive.ts**: 处理消息接收事件
- **card.ts**: 处理卡片交互事件
- **group.ts**: 处理群组相关事件
- **reaction.ts**: 处理表情回应事件
- **enter.ts**: 处理进入聊天事件

## 使用示例

### HTTP 模式

```typescript
import { HttpRouterManager } from './services/lark/router';
import { multiBotManager } from './utils/bot/multi-bot-manager';

// 获取 HTTP 模式的机器人
const httpBots = multiBotManager.getBotsByInitType('http');

// 创建路由配置
const routerConfigs = HttpRouterManager.createMultipleRouterConfigs(httpBots);

// 注册路由到 Koa 应用
routerConfigs.forEach(config => {
    router.post(`/webhook/${config.botName}/event`, config.eventRouter);
    router.post(`/webhook/${config.botName}/card`, config.cardActionRouter);
});
```

### WebSocket 模式

```typescript
import { WebSocketManager } from './services/lark/websocket';
import { multiBotManager } from './utils/bot/multi-bot-manager';

// 获取 WebSocket 模式的机器人
const websocketBots = multiBotManager.getBotsByInitType('websocket');

// 启动 WebSocket 连接
WebSocketManager.startMultipleWebSockets(websocketBots);
```

### 策略模式使用

```typescript
import { StartupStrategyManager } from './services/lark/startup-strategy';

// 注册自定义策略
StartupStrategyManager.registerStrategy('custom', new CustomStartupStrategy());

// 执行策略
const result = await StartupStrategyManager.executeStrategy('custom', botConfigs);
```

## 配置

### 机器人配置

每个机器人需要以下配置：

```typescript
interface BotConfig {
    bot_name: string;
    app_id: string;
    app_secret: string;
    verification_token: string;
    encrypt_key: string;
    init_type: 'http' | 'websocket';
    is_active: boolean;
}
```

### 路由配置

HTTP 路由支持可配置的路径模板：

```typescript
interface RouteConfig {
    eventPath: string;    // 如 '/webhook/{botName}/event'
    cardPath: string;     // 如 '/webhook/{botName}/card'
}
```

## 装饰器集成

Lark 服务模块与装饰器工厂紧密集成，提供统一的事件处理装饰：

```typescript
import { EventDecoratorFactory } from '../../utils/decorator-factory';

// HTTP 模式装饰器
const httpDecorator = EventDecoratorFactory.createEventDecorator('http');

// WebSocket 模式装饰器（带上下文注入）
const wsDecorator = EventDecoratorFactory.createEventDecorator('websocket', botConfig);
```

## 错误处理

所有事件处理器都包含完整的错误处理：

- **HTTP 模式**: 错误会被记录但不会中断其他请求
- **WebSocket 模式**: 错误会被记录，连接会尝试重新建立
- **上下文错误**: 包含机器人名称和追踪 ID 的详细错误信息

## 监控和日志

- **事件追踪**: 每个事件都有唯一的追踪 ID
- **机器人标识**: 日志中包含机器人名称标识
- **性能监控**: 记录事件处理时间和状态
- **连接状态**: WebSocket 连接状态监控

## 扩展性

### 添加新的事件处理器

1. 在 `events/` 目录下创建新的处理器文件
2. 在 `EventDecoratorFactory.getEventHandlerMap()` 中添加映射
3. 在 `HttpRouterManager` 和 `WebSocketManager` 中注册处理器

### 添加新的启动策略

```typescript
class CustomStartupStrategy implements StartupStrategy {
    initialize(botConfigs: BotConfig[]): any {
        // 自定义初始化逻辑
    }
}

StartupStrategyManager.registerStrategy('custom', new CustomStartupStrategy());
```

## 迁移指南

### 从旧版本迁移

旧版本的 `service.ts` 文件已被重构为兼容层，建议迁移到新的模块化 API：

```typescript
// 旧版本
import { initializeMultiBotHttpMode, startMultiBotWebSocket } from './events/service';

// 新版本
import { HttpRouterManager } from './router';
import { WebSocketManager } from './websocket';
import { StartupStrategyManager } from './startup-strategy';
```

## 最佳实践

1. **策略选择**: 根据部署环境选择合适的初始化策略
2. **错误处理**: 确保所有事件处理器都有适当的错误处理
3. **资源管理**: 正确管理 WebSocket 连接的生命周期
4. **配置管理**: 使用环境变量管理不同环境的配置
5. **监控集成**: 集成适当的监控和告警系统
