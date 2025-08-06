# 启动模块 (Startup Module)

负责应用的初始化、启动与优雅关闭。

## 目录结构

```
startup/
├── application.ts      # 应用程序管理器（生命周期编排）
├── database.ts         # 数据库初始化/关闭
├── server.ts           # Koa HTTP 服务器管理
└── README.md
```

## 核心组件

### ApplicationManager

统一编排启动与关闭流程。

职责：
- 初始化数据库、多机器人管理器、Lark 客户端等
- 启动 WebSocket 与 HTTP 服务
- 处理 SIGINT/SIGTERM 实现优雅关闭

### DatabaseManager

统一管理数据库连接的初始化与关闭。

支持：
- PostgreSQL（TypeORM）
- MongoDB
- Redis

### HttpServerManager

创建与启动 Koa 应用。

职责：
- 加载中间件（CORS/Trace/Bot 上下文/BodyParser 等）
- 按机器人动态注册事件/卡片回调路由与健康检查
- 监听端口启动 HTTP 服务

## 使用

应用入口在项目根目录的 index.ts：

```typescript
// src/index.ts
import { ApplicationManager, createDefaultConfig } from './startup/application';

(async () => {
  const config = createDefaultConfig();
  const app = new ApplicationManager(config);
  await app.initialize();
  await app.start();
})();
```
