# Inner Bot Server - 主服务器

主服务器是Inner Bot Server的核心组件，基于Node.js和TypeScript构建，负责处理飞书机器人的所有业务逻辑、消息处理、规则引擎和外部服务集成。

## 概述

主服务器作为飞书机器人的"中枢神经"，负责：

- 接收和处理来自飞书平台的所有事件
- 执行基于规则的消息处理和响应
- 管理群聊和用户数据
- 协调AI服务进行智能对话
- 提供媒体处理能力（图片、表情包）
- 维护数据一致性和服务稳定性

### 主要功能

- **飞书集成**：完整的飞书API集成，支持WebSocket和HTTP两种模式
- **规则引擎**：灵活的消息处理规则系统，支持复读、管理员命令等功能
- **AI对话**：与AI服务协作，提供智能聊天体验
- **媒体处理**：图片搜索、表情包生成、照片管理
- **数据管理**：用户信息、群组数据、消息历史的完整管理
- **事件系统**：支持跨服务通信和实时事件处理

## 技术栈

- **运行时**：Node.js + TypeScript
- **框架**：Koa.js（HTTP服务器）
- **数据库**：PostgreSQL（主数据库）、MongoDB（消息存储）
- **缓存**：Redis（事件系统和缓存）
- **ORM**：TypeORM（PostgreSQL）
- **通信**：飞书OpenAPI SDK、事件系统
- **部署**：Docker容器化

## 项目结构

```
main-server/src/
├── startup/               # 启动模块
│   ├── application.ts     # 应用程序管理器
│   ├── database.ts        # 数据库初始化管理
│   ├── server.ts          # HTTP 服务器管理
│   └── README.md          # 启动模块文档
├── dal/                   # 数据访问层
│   ├── entities/          # 数据库实体定义
│   │   ├── lark-base-chat-info.ts      # 基础聊天信息
│   │   ├── lark-group-chat-info.ts     # 群聊信息
│   │   ├── lark-group-member.ts        # 群成员信息
│   │   ├── lark-user.ts                # 用户信息
│   │   ├── lark-user-open-id.ts        # 用户OpenID映射
│   │   ├── user-chat-mapping.ts        # 用户聊天映射
│   │   └── user-group-binding.ts       # 用户群组绑定
│   ├── mongo/             # MongoDB相关
│   │   ├── client.ts      # MongoDB客户端
│   │   └── collection.ts  # 集合定义
│   ├── repositories/      # 数据仓库模式
│   │   ├── repositories.ts  # 仓库汇总
│   │   └── user-group-binding-repository.ts
│   └── redis.ts           # Redis客户端
├── services/              # 核心服务层
│   ├── lark/              # 飞书平台集成
│   │   ├── router.ts      # HTTP 路由管理
│   │   ├── websocket.ts   # WebSocket 连接管理
│   │   ├── startup-strategy.ts # 启动策略管理
│   │   ├── basic/         # 基础飞书操作
│   │   │   ├── card-manager.ts  # 卡片管理
│   │   │   ├── group.ts         # 群组管理
│   │   │   └── message.ts       # 消息发送
│   │   ├── events/        # 飞书事件处理
│   │   │   ├── service.ts       # 事件服务入口（兼容层）
│   │   │   ├── receive.ts       # 消息接收
│   │   │   ├── group.ts         # 群组事件
│   │   │   ├── card.ts          # 卡片事件
│   │   │   └── reaction.ts      # 表情回应
│   │   └── README.md      # Lark 服务模块文档
│   ├── ai/                # AI服务集成
│   │   ├── chat.ts        # AI聊天集成
│   │   ├── reply.ts       # AI回复处理
│   │   └── chat-state-machine.ts # 聊天状态机
│   ├── message-processing/ # 消息处理
│   │   ├── rule-engine.ts  # 规则引擎核心
│   │   ├── rules/          # 消息处理规则
│   │   │   ├── admin/      # 管理员规则
│   │   │   ├── general/    # 通用规则
│   │   │   └── group/      # 群聊规则
│   │   └── README.md       # 消息处理文档
│   ├── media/             # 媒体处理
│   │   ├── photo/         # 图片处理
│   │   └── meme/          # 表情包生成
│   ├── message-store/     # 消息存储
│   ├── integrations/      # 外部服务集成
│   └── initialize/        # 初始化服务
├── utils/                 # 工具函数
│   ├── decorator-factory.ts # 装饰器工厂
│   ├── logger-factory.ts  # 日志工厂
│   ├── logger.ts          # 日志模块
│   ├── context.ts         # 上下文管理
│   ├── websocket-context.ts # WebSocket 上下文
│   ├── bot/              # 机器人工具
│   ├── text/             # 文本处理
│   ├── cache/            # 缓存工具
│   ├── rate-limiting/    # 限流工具
│   ├── state-machine/    # 状态机工具
│   └── sse/              # SSE工具
├── models/                # 数据模型
├── types/                 # TypeScript类型定义
├── middleware/           # 中间件
├── handlers/             # 请求处理器
├── index.ts              # 应用入口
└── ormconfig.ts          # 数据库配置
```

## 核心模块说明

### 启动模块 (startup/)

- `application.ts`: 应用程序主管理器，统一管理启动和关闭流程
- `database.ts`: 数据库连接管理器，支持 PostgreSQL、MongoDB、Redis
- `server.ts`: HTTP 服务器管理器，提供可配置的路由和中间件管理
- `README.md`: 详细的启动模块文档

### 飞书集成 (services/lark/)

- `router.ts`: HTTP 路由管理器，负责创建和管理 HTTP 模式下的事件路由
- `websocket.ts`: WebSocket 客户端管理器，负责 WebSocket 模式下的事件处理
- `startup-strategy.ts`: 启动策略管理器，使用策略模式管理不同初始化类型
- `README.md`: 详细的 Lark 服务模块文档

**基础操作 (basic/)**

- `message.ts`: 消息发送和管理
- `group.ts`: 群组管理和成员操作
- `card-manager.ts`: 飞书卡片管理和流式更新

**事件处理 (events/)**

- `receive.ts`: 消息接收和预处理
- `group.ts`: 群组事件处理（加入、离开、权限变更）
- `card.ts`: 卡片交互事件
- `reaction.ts`: 表情回应事件
- `service.ts`: 事件服务入口

### 工具模块 (utils/)

- `decorator-factory.ts`: 事件处理装饰器工厂，统一 HTTP 和 WebSocket 模式的装饰器逻辑
- `logger-factory.ts`: 日志工厂，提供可注入的日志配置，支持单元测试
- `context.ts`: 上下文管理，提供 AsyncLocalStorage 支持
- `websocket-context.ts`: WebSocket 上下文装饰器

### 消息处理 (services/message-processing/)

**规则引擎 (rule-engine.ts)**

- 基于规则链的消息处理系统
- 支持同步和异步规则
- 支持规则优先级和穿透机制

**规则类型**

- `admin/`: 管理员命令（余额查询、消息撤回、指令处理）
- `general/`: 通用功能（帮助、查重、历史记录）
- `group/`: 群聊功能（复读、群组权限管理）

### AI服务集成 (services/ai/)

**核心组件**

- `chat.ts`: AI聊天服务集成，支持SSE流式对话
- `reply.ts`: AI回复处理和卡片生成
- `chat-state-machine.ts`: 聊天状态机管理

**功能特性**

- 流式对话支持
- 状态机管理对话流程
- 错误处理和重试机制
- 工具调用集成

### 媒体处理 (services/media/)

**图片处理 (photo/)**

- Pixiv图片搜索和发送
- 图片权限管理
- 图片详情卡片生成

**表情包处理 (meme/)**

- 表情包检测和生成
- 模板管理和文本叠加

### 数据管理 (dal/)

**实体定义 (entities/)**

- 完整的飞书数据模型
- 用户、群组、消息关系管理
- 权限配置和状态管理

**数据访问**

- TypeORM集成
- MongoDB消息存储
- Redis缓存和事件

## 配置说明

### 环境变量

```bash
# 飞书机器人配置
MAIN_BOT_APP_ID=your_app_id
MAIN_BOT_APP_SECRET=your_app_secret
MAIN_VERIFICATION_TOKEN=your_verification_token
MAIN_ENCRYPT_KEY=your_encrypt_key
MAIN_ROBOT_UNION_ID=your_robot_union_id

# 开发环境配置
DEV_BOT_APP_ID=your_dev_app_id
DEV_BOT_APP_SECRET=your_dev_app_secret

# 数据库配置
POSTGRES_HOST=localhost
POSTGRES_USER=your_db_user
POSTGRES_PASSWORD=your_db_password
POSTGRES_DB=your_db_name
SYNCHRONIZE_DB=false

# MongoDB配置
MONGO_INITDB_HOST=localhost
MONGO_INITDB_ROOT_USERNAME=your_mongo_user
MONGO_INITDB_ROOT_PASSWORD=your_mongo_password

# Redis配置
REDIS_IP=localhost
REDIS_PASSWORD=your_redis_password

# AI服务配置
AI_SERVER_HOST=localhost
AI_SERVER_PORT=8000

# 外部服务配置
MEME_HOST=localhost
MEME_PORT=2233
MEMORY_BASE_URL=http://localhost:8002

# 服务配置
USE_WEBSOCKET=true
LOG_LEVEL=info
ENABLE_FILE_LOGGING=true
LOG_DIR=/var/log/main-server
```

### 数据库模式

**PostgreSQL表结构**

- `lark_base_chat_info`: 基础聊天信息
- `lark_group_chat_info`: 群聊详细信息
- `lark_group_member`: 群成员关系
- `lark_user`: 用户基本信息
- `lark_user_open_id`: OpenID映射
- `user_chat_mapping`: 用户聊天映射
- `user_group_binding`: 用户群组绑定

## 启动服务

### 开发环境

```bash
# 安装依赖
npm install

# 启动开发服务
npm run start

# 或使用TypeScript直接运行
ts-node src/index.ts
```

### 生产环境

```bash
# 构建项目
npm run build

# 启动生产服务
node dist/index.js

# 或使用Docker
docker build -t main-server .
docker run -p 3000:3000 main-server
```

## 服务模式

### WebSocket模式（推荐）

```bash
# 启用WebSocket模式
USE_WEBSOCKET=true
```

- 实时事件处理
- 更高的性能和稳定性
- 支持长连接和心跳检测
- 本地开发推荐使用此项

### HTTP模式

```bash
# 启用HTTP模式
USE_WEBSOCKET=false
```

- 传统的Webhook方式
- 适合简单部署环境
- 支持负载均衡

## 健康检查

```bash
# 检查服务状态
curl http://localhost:3000/api/health

# 响应示例
{
    "status": "ok",
    "timestamp": "2024-01-01T12:00:00Z",
    "service": "main-server"
}
```

## 开发指南

### 使用新的模块化 API

**启动应用程序**

```typescript
import { ApplicationManager, createDefaultConfig } from './startup/application';

const config = createDefaultConfig();
const app = new ApplicationManager(config);

await app.initialize();
await app.start();
```

**创建 HTTP 路由**

```typescript
import { HttpRouterManager } from './services/lark/router';

const routerConfigs = HttpRouterManager.createMultipleRouterConfigs(botConfigs);
```

**启动 WebSocket 连接**

```typescript
import { WebSocketManager } from './services/lark/websocket';

WebSocketManager.startMultipleWebSockets(botConfigs);
```

**使用策略模式**

```typescript
import { StartupStrategyManager } from './services/lark/startup-strategy';

const result = await StartupStrategyManager.executeStrategy('http', botConfigs);
```

### 添加新规则

```typescript
// 在 services/message-processing/rule-engine.ts 中添加
{
    rules: [YourRule, TextMessageLimit, NeedRobotMention],
    handler: yourHandler,
    comment: '你的规则描述',
}
```

### 处理飞书事件

```typescript
// 在 services/lark/events/ 中添加新的事件处理器
export async function handleYourEvent(params: YourEventType) {
    // 处理你的事件逻辑
}

// 在 EventDecoratorFactory.getEventHandlerMap() 中添加映射
'your.event.type': 'handleYourEvent'
```

### 集成外部服务

```typescript
// 在 services/integrations/ 中添加新的服务集成
export class YourServiceClient {
    async callService(data: any) {
        // 调用外部服务
    }
}
```

### 自定义启动策略

```typescript
import { StartupStrategy, StartupStrategyManager } from './services/lark/startup-strategy';

class CustomStartupStrategy implements StartupStrategy {
    initialize(botConfigs: BotConfig[]): any {
        // 自定义初始化逻辑
    }
}

StartupStrategyManager.registerStrategy('custom', new CustomStartupStrategy());
```

### 自定义日志配置

```typescript
import { LoggerFactory, LoggerConfig } from './utils/logger-factory';

const customConfig: LoggerConfig = {
    level: 'debug',
    enableFileLogging: true,
    logDir: './logs',
    logFileName: 'custom.log',
    maxFileSize: 10485760, // 10MB
    maxFiles: 10,
    enableConsoleOverride: true,
};

const logger = LoggerFactory.createLogger(customConfig);
```

## 性能优化

- 使用连接池管理数据库连接
- Redis缓存频繁查询的数据
- 异步处理消息和事件
- 状态机管理复杂流程
- 限流防止API滥用

## 监控和日志

- 结构化日志记录
- 请求追踪ID
- 性能指标监控
- 错误报告和告警
- 健康检查端点

## 部署和运维

### 初始化

```bash
# 首次部署时设置
NEED_INIT=true
```

- 自动拉取群组信息
- 初始化数据库表结构
- 配置机器人权限

### 监控指标

- 消息处理延迟
- 数据库连接状态
- 外部服务可用性
- 内存和CPU使用率

### 故障排查

1. **启动问题**: 检查 `startup/` 模块的初始化日志
2. **路由问题**: 验证 `HttpRouterManager` 的路由配置
3. **WebSocket 问题**: 检查 `WebSocketManager` 的连接状态
4. **装饰器问题**: 确认 `EventDecoratorFactory` 的配置正确

#### 调试工具

```typescript
// 获取应用实例进行调试
const app = new ApplicationManager(config);
const httpServer = app.getHttpServer();
const koaApp = httpServer?.getApp();

// 获取日志配置
const loggerConfig = LoggerFactory.getConfig();

// 查看可用的启动策略
const strategies = StartupStrategyManager.getAvailableStrategies();
```

