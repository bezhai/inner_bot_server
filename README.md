# Inner Bot Server

一个功能完整的飞书机器人服务平台，采用 Monorepo 架构，支持智能对话、图片搜索、群组管理和定时任务等功能。

## 功能特点

- **智能对话**：基于 OpenAI 的流式对话，支持工具调用和记忆管理
- **媒体搜索**：Pixiv 图片搜索、表情包生成、照片管理
- **群���功能**：复读检测、消息统计、权限管理、水群排行榜
- **定时任务**：自动下载 Pixiv 作品、同步 Bangumi 数据
- **简单部署**：Docker 容器化，一键启动

## 技术栈

| 层级 | 技术 |
|------|------|
| **Main Server** | Node.js, TypeScript, Koa.js, TypeORM |
| **AI Service** | Python, FastAPI, LangChain, LangGraph |
| **数据库** | PostgreSQL, MongoDB, Redis, Qdrant |
| **日志监控** | Elasticsearch, Logstash, Kibana |
| **部署** | Docker, Docker Compose |

## 快速开始

### 系统要求

- Docker & Docker Compose
- 2GB+ 内存
- 10GB+ 磁盘空间

### 部署步骤

```bash
# 1. 克隆代码
git clone https://github.com/your-org/inner_bot_server.git
cd inner_bot_server

# 2. 配置环境变量
cp .env.example .env
vim .env  # 填写飞书机器人凭证和数据库密码

# 3. 启动服务
make start

# 4. 验证部署
curl http://localhost/api/health
```

详细部署说明请参考 [部署指南](docs/deployment.md)。

## 服务架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        应用层 (Apps)                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   Main Server   │  │   AI Service    │  │     Cronjob     │  │
│  │   (Node.js)     │  │    (Python)     │  │   (Node.js)     │  │
│  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤  │
│  │ • 飞书事件处理   │  │ • 对话引擎      │  │ • Pixiv 下载    │  │
│  │ • 规则引擎      │  │ • 工具调用系统   │  │ • Bangumi 同步  │  │
│  │ • 媒体处理      │  │ • 记忆管理      │  │ • 定时推送      │  │
│  │ • 卡片生命周期   │  │ • 向量检索      │  │ • 任务队列      │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       共享包 (Packages)                          │
├─────────────────────────────────────────────────────────────────┤
│  @inner/shared (TS)  │  @inner/lark-utils  │  inner-shared (Py) │
│  Redis/Mongo/Logger  │  飞书 API 封装       │  装饰器/中间件      │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      基础设施层 (Infra)                          │
├─────────────────────────────────────────────────────────────────┤
│ PostgreSQL │ MongoDB │ Redis │ Elasticsearch │ Qdrant │ Kibana  │
└─────────────────────────────────────────────────────────────────┘
```

## 项目结构

```
inner_bot_server/
├── apps/                       # 应用服务
│   ├── main-server/           # 飞书机器人主服务 (Node.js/TypeScript)
│   │   ├── src/
│   │   │   ├── api/           # HTTP 路由
│   │   │   ├── core/          # 核心业务逻辑
│   │   │   │   ├── models/    # 领域模型
│   │   │   │   ├── rules/     # 规则引擎
│   │   │   │   └── services/  # 业务服务
│   │   │   ├── infrastructure/# 基础设施
│   │   │   │   ├── cache/     # Redis 缓存
│   │   │   │   ├── dal/       # 数据访问层
│   │   │   │   └── integrations/ # 外部集成
│   │   │   ├── middleware/    # Koa 中间件
│   │   │   └── startup/       # 启动管理
│   │   └── package.json
│   │
│   ├── ai-service/            # AI 对话服务 (Python/FastAPI)
│   │   ├── app/
│   │   │   ├── api/           # API 路由
│   │   │   ├── agents/        # AI 代理
│   │   │   ├── services/      # 业务服务
│   │   │   │   └── chat/      # 聊天服务
│   │   │   ├── tools/         # 工具系统
│   │   │   └── core/          # 核心模块
│   │   └── pyproject.toml
│   │
│   └── cronjob/               # 定时任务服务 (Node.js)
│       ├── src/
│       │   ├── service/       # 业务逻辑
│       │   ├── mongo/         # MongoDB 访问
│       │   └── pixiv/         # Pixiv 集成
│       └── package.json
│
├── packages/                   # 共享包
│   ├── ts-shared/             # TypeScript 公共模块 (@inner/shared)
│   ├── lark-utils/            # 飞书工具包 (@inner/lark-utils)
│   ├── pixiv-client/          # Pixiv 客户端 (@inner/pixiv-client)
│   └── py-shared/             # Python 公共模块 (inner-shared)
│
├── infra/                      # 基础设施配置
│   ├── compose/               # Docker Compose 文件
│   ├── redis/                 # Redis 配置
│   └── database/              # 数据库配置
│
├── schema/                     # 数据库 Schema (Atlas)
├── scripts/                    # 部署和运维脚本
├── docs/                       # 项目文档
├── docker-compose.yml          # Docker 编排
├── Makefile                    # 管理命令
└── package.json                # Monorepo 配置
```

## 使用方法

在飞书群中 @机器人 并发送命令：

| 命令 | 说明 |
|------|------|
| `@机器人 你好` | 开始智能对话 |
| `@机器人 发图 二次元` | 搜索 Pixiv 图片 |
| `@机器人 水群` | 查看群聊统计和排行榜 |
| `@机器人 帮助` | 查看功能帮助 |

## 常用命令

```bash
# 启动服务
make start              # 生产环境（后台）
make start-dev          # 开发环境（前台）

# 停止服务
make down

# 更新部署
make deploy             # 滚动更新
make deploy-live        # 仅更新变更服务

# 数据库
make db-sync            # 同步数据库 Schema

# 监控
make health-check       # 执行健康检查
make monitoring-setup   # 设置监控定时任务

# 日志
docker compose logs -f app      # 主服务日志
docker compose logs -f ai-app   # AI 服务日志
```

## 服务端口

| 服务 | 端口 | 说明 |
|------|------|------|
| Main Server | 3001 | 飞书机器人 API |
| AI Service | 8000 | 智能对话服务 |
| PostgreSQL | 5432 | 关系型数据库 |
| MongoDB | 27017 | 文档数据库 |
| Redis | 6379 | 缓存和消息队列 |
| Elasticsearch | 9200 | 日志搜索 |
| Kibana | 5601 | 日志可视化 |
| Qdrant | 6333 | 向量数据库 |

## 文档

- [部署指南](docs/deployment.md) - 详细部署和配置说明
- [项目架构](docs/architecture.md) - 系统架构和设计说明
- [开发指南](docs/development.md) - 本地开发环境搭建
- [API 参考](docs/api.md) - API 端点文档
- [健康检查](docs/health_check.md) - 自动监控和告警设置
- [自动部署](docs/auto_deploy.md) - 自动更新配置
- [长期任务](docs/long_tasks.md) - 异步任务框架使用
- [Monorepo 整合](docs/monorepo_integration.md) - 仓库整合说明

## 许可证

MIT License
