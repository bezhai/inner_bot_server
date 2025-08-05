# 启动模块 (Startup Module)

启动模块负责管理应用程序的初始化和启动流程，提供模块化、可配置的启动管理。

## 模块结构

```
startup/
├── application.ts      # 应用程序管理器
├── database.ts         # 数据库初始化管理
├── server.ts          # HTTP 服务器管理
└── README.md          # 本文档
```

## 核心组件

### ApplicationManager

应用程序的主管理器，统一管理整个应用的启动和关闭流程。

```typescript
import { ApplicationManager, createDefaultConfig } from './startup/application';

const config = createDefaultConfig();
const app = new ApplicationManager(config);

await app.initialize();
await app.start();
```

**主要功能：**
- 统一的初始化流程管理
- 数据库连接初始化
- 多机器人管理器初始化
- Lark 客户端池初始化
- WebSocket 和 HTTP 服务启动
- 优雅关闭处理

### DatabaseManager

数据库连接管理器，负责初始化和关闭所有数据库连接。

```typescript
import { DatabaseManager } from './startup/database';

// 初始化所有数据库连接
await DatabaseManager.initialize();

// 关闭所有数据库连接
await DatabaseManager.close();
```

**支持的数据库：**
- PostgreSQL (通过 TypeORM)
- MongoDB
- Redis

### HttpServerManager

HTTP 服务器管理器，提供可配置的 HTTP 服务器启动和路由管理。

```typescript
import { HttpServerManager } from './startup/server';

const config = {
    port: 3000,
    routeConfig: {
        eventPath: '/webhook/{botName}/event',
        cardPath: '/webhook/{botName}/card'
    }
};

const server = new HttpServerManager(config);
await server.start();
```

**主要功能：**
- 可配置的路由前缀
- 自动机器人路由注册
- 健康检查端点
- 中间件管理

## 配置选项

### ApplicationConfig

```typescript
interface ApplicationConfig {
    server: ServerConfig;
    enableWebSocket: boolean;
}
```

### ServerConfig

```typescript
interface ServerConfig {
    port: number;
    routeConfig: RouteConfig;
}

interface RouteConfig {
    eventPath: string;    // 事件路由模板，如 '/webhook/{botName}/event'
    cardPath: string;     // 卡片路由模板，如 '/webhook/{botName}/card'
}
```

## 使用示例

### 基本启动

```typescript
import { ApplicationManager, createDefaultConfig, setupProcessHandlers } from './startup/application';

const config = createDefaultConfig();
const app = new ApplicationManager(config);

// 设置进程信号处理
setupProcessHandlers(app);

// 启动应用
await app.initialize();
await app.start();
```

### 自定义配置

```typescript
const customConfig = {
    server: {
        port: 8080,
        routeConfig: {
            eventPath: '/api/bots/{botName}/events',
            cardPath: '/api/bots/{botName}/cards'
        }
    },
    enableWebSocket: true
};

const app = new ApplicationManager(customConfig);
```

### 测试环境

```typescript
// 获取 HTTP 服务器实例用于测试
const httpServer = app.getHttpServer();
const koaApp = httpServer?.getApp();
```

## 环境变量

启动模块会读取以下环境变量：

```bash
# WebSocket 配置
USE_WEBSOCKET=true

# 数据库配置
POSTGRES_HOST=localhost
POSTGRES_USER=your_user
POSTGRES_PASSWORD=your_password
POSTGRES_DB=your_database

# MongoDB 配置
MONGO_INITDB_HOST=localhost
MONGO_INITDB_ROOT_USERNAME=your_user
MONGO_INITDB_ROOT_PASSWORD=your_password

# Redis 配置
REDIS_IP=localhost
REDIS_PASSWORD=your_password

# 日志配置
LOG_LEVEL=info
ENABLE_FILE_LOGGING=true
LOG_DIR=/var/log/main-server
```

## 错误处理

启动模块提供完整的错误处理和优雅关闭：

- **初始化错误**：如果任何初始化步骤失败，应用将记录错误并退出
- **运行时错误**：未捕获的异常和未处理的 Promise 拒绝会被记录并导致进程退出
- **优雅关闭**：SIGINT 和 SIGTERM 信号会触发优雅关闭流程

## 扩展性

启动模块设计为可扩展的：

1. **自定义初始化步骤**：可以继承 `ApplicationManager` 并重写初始化方法
2. **自定义服务器配置**：可以提供自定义的 `ServerConfig`
3. **自定义数据库管理**：可以扩展 `DatabaseManager` 以支持更多数据库类型

## 最佳实践

1. **配置管理**：使用环境变量和配置文件管理不同环境的配置
2. **错误处理**：确保所有异步操作都有适当的错误处理
3. **资源清理**：在应用关闭时确保所有资源都被正确释放
4. **测试支持**：使用依赖注入和工厂模式支持单元测试