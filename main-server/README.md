# Main Server (主服务)

本项目为内部机器人系统的核心后端，基于 Koa.js 与 TypeScript。职责包括：
- 处理飞书（Lark）事件回调与消息交互
- 执行业务规则与 AI 对话流程
- 管理持久化与缓存
- 对外提供管理/健康检查等 HTTP 接口

## 架构概览

采用模块化设计，职责清晰、便于维护。

- **dal**：数据访问层（Data Access Layer）。通过仓库模式封装对 PostgreSQL、MongoDB 的访问。
- **handlers**：HTTP 路由处理器（如 /prompts、健康检查）。
- **services**：核心服务层（Lark 集成、消息处理规则引擎、AI 聊天状态机等）。
- **startup**：应用启动/关闭协调与初始化编排。
- **middleware**：Koa 中间件（Tracing、Bot 上下文、错误处理等）。
- **models / types**：应用内部模型与全局类型。
- **utils**：通用工具库（缓存、限流、文本处理、状态机等）。

各子模块的详细文档可参阅相应目录下的 README：
- services/lark/events 文档: 请见 main-server/src/services/lark/events/README.md
- services/message-processing 文档: 请见 main-server/src/services/message-processing/README.md
- startup 文档: 请见 main-server/src/startup/README.md
- utils 文档: 请见 main-server/src/utils/README.md

## 启动流程

由 startup/application.ts 的 ApplicationManager 统一编排：
1) 初始化数据库连接（DatabaseManager）
2) 加载并初始化多机器人配置（multiBotManager）
3) 初始化 Lark 客户端池（initializeLarkClients）
4) 执行每个机器人的特定初始化逻辑（botInitialization）
5) 启动服务：
   - init_type=websocket 的机器人启动 WebSocket 监听
   - 启动 Koa 服务并为 init_type=http 的机器人注册事件/卡片回调路由（HttpServerManager）

## 技术栈

- 运行时：Node.js + TypeScript
- 框架：Koa.js
- 数据库：PostgreSQL（主数据），MongoDB（消息存储）
- 缓存：Redis
- ORM：TypeORM（PostgreSQL）
- 通信：飞书 OpenAPI SDK、内部事件系统
- 部署：Docker

## 配置

请将仓库根目录的 .env.example 复制为 .env 并按需填写。

### 必需配置
```bash
# PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_USER=your_db_user
POSTGRES_PASSWORD=your_db_password
POSTGRES_DB=your_db_name
SYNCHRONIZE_DB=false

# MongoDB
MONGO_INITDB_HOST=localhost
MONGO_INITDB_ROOT_USERNAME=your_mongo_user
MONGO_INITDB_ROOT_PASSWORD=your_mongo_password

# Redis
REDIS_IP=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# AI 服务
AI_SERVER_HOST=localhost
AI_SERVER_PORT=8000

# 外部服务
MEME_HOST=http://localhost
MEME_PORT=2233
MEMORY_BASE_URL=http://localhost:8002

# 日志
LOG_LEVEL=info
ENABLE_FILE_LOGGING=true
LOG_DIR=/var/log/main-server
```

### 可选配置
```bash
AI_PROVIDER_ADMIN_KEY=   # AI 服务认证（如需要）
NEED_INIT=false          # 首次启动初始化
IS_DEV=false             # 开发模式
HTTP_SECRET=             # 阿里云代理认证
PROXY_HOST=              # 代理服务器地址
```

## API

对外暴露的典型端点：

- GET /api/health：健康检查
- POST /webhook/{botName}/event：飞书事件回调
- POST /webhook/{botName}/card：飞书卡片操作回调
- GET /prompts：获取提示语列表
- POST /prompts：创建提示语
- PUT /prompts/{id}：更新指定提示语
- DELETE /prompts/{id}：删除指定提示语
