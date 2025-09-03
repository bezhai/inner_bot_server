# Inner Bot Server

Inner Bot Server 是一个功能丰富的**飞书机器人**系统，基于微服务架构构建，提供智能对话、媒体处理、群组管理等多种功能。

## 📖 项目概述

Inner Bot Server 是一个完整的飞书机器人解决方案，集成了AI对话、图片搜索、表情包生成、群组管理等功能。机器人采用"赤尾"角色设定，是一个活泼可爱的AI助手，能够与用户进行自然流畅的对话交流。

### 🌟 主要特性

- **🤖 智能对话**：基于OpenAI GPT模型，支持流式对话和工具调用
- **🎨 媒体处理**：Pixiv图片搜索、表情包生成、图片管理
- **👥 群组管理**：复读功能、权限控制、用户管理
- **🔧 规则引擎**：灵活的消息处理规则，支持自定义命令
- **📊 数据分析**：消息统计、用户活跃度、聊天记录分析
- **⚡ 高性能**：基于事件驱动架构，支持高并发处理
- **🔍 全文搜索**：基于Elasticsearch的消息检索
- **📈 监控告警**：完整的日志系统和性能监控

### 🏗️ 系统架构

```text
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   飞书平台       │    │   用户界面       │    │   管理后台       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Inner Bot Server                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐                                        │
│  │   Main Server   │                                        │
│  │                 │                                        │
│  │ • 飞书API集成    │                                        │
│  │ • AI对话引擎     │                                        │
│  │ • 规则引擎       │                                        │
│  │ • 媒体处理       │                                        │
│  │ • 事件系统       │                                        │
│  │ • 工具调用系统   │                                        │
│  │ • 记忆管理       │                                        │
│  │ • 提示词管理     │                                        │
│  └─────────────────┘                                        │
└─────────────────────────────────────────────────────────────────┘
         │                                    │
         ▼                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                      数据存储层                                  │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────┐ │
│  │ PostgreSQL  │  │  MongoDB    │  │    Redis    │  │ Elasticsearch│ │
│  │             │  │             │  │             │  │          │ │
│  │ • 用户数据   │  │ • 消息记录   │  │ • 缓存      │  │ • 日志搜索│ │
│  │ • 群组信息   │  │ • 聊天历史   │  │ • 事件队列  │  │ • 全文检索│ │
│  │ • 权限配置   │  │ • 媒体文件   │  │ • 会话状态  │  │ • 监控数据│ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └──────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## 🚀 技术栈

### 核心技术

- **后端框架**：Node.js + TypeScript
- **数据库**：PostgreSQL、MongoDB、Redis
- **AI模型**：OpenAI GPT系列
- **消息队列**：Redis事件系统
- **搜索引擎**：Elasticsearch
- **容器化**：Docker + Docker Compose

### 主要依赖

- **飞书SDK**：@larksuiteoapi/node-sdk
- **ORM**：TypeORM (PostgreSQL)、MongoDB Driver
- **HTTP框架**：Koa.js
- **日志系统**：Winston、Logstash、Kibana
- **工具系统**：自研装饰器工具框架

## 📁 项目结构

```text
inner_bot_server/
├── main-server/           # 主服务器 (Node.js + TypeScript)
│   ├── src/
│   │   ├── services/      # 业务服务层
│   │   │   ├── lark/      # 飞书平台集成
│   │   │   ├── ai/        # AI服务集成
│   │   │   ├── media/     # 媒体处理
│   │   │   └── message-processing/ # 消息处理
│   │   ├── dal/           # 数据访问层
│   │   ├── events/        # 事件系统
│   │   ├── types/         # 类型定义
│   │   └── utils/         # 工具函数
│   ├── Dockerfile
│   └── package.json

├── docs/                  # 项目文档
│   ├── deployment.md      # 部署指南
│   ├── event_system.md    # 事件系统文档
│   ├── health_check.md    # 健康检查
│   └── auto_deploy.md     # 自动部署
├── scripts/               # 部署脚本
│   ├── auto_deploy.sh     # 自动部署脚本
│   ├── health_check.sh    # 健康检查脚本
│   └── ensure_dirs.sh     # 目录初始化
├── logstash/              # 日志处理配置
│   ├── config/
│   └── pipeline/
├── docker-compose.yml     # 服务编排
├── Makefile              # 构建和部署命令
└── README.md             # 项目说明
```

## 🎯 核心功能

### 1. 智能对话

- **角色设定**：内置"赤尾"AI角色，活泼可爱的对话风格
- **多轮对话**：支持上下文记忆和连续对话
- **工具调用**：集成网络搜索、计算器、时间查询等工具
- **流式响应**：支持实时流式对话体验

### 2. 媒体处理

- **图片搜索**：Pixiv图片搜索和发送
- **表情包生成**：自动生成个性化表情包
- **权限控制**：群组级别的媒体权限管理

### 3. 群组管理

- **复读功能**：智能复读检测和响应
- **权限系统**：细粒度的群组权限控制
- **用户管理**：用户信息和群组关系管理
- **消息统计**：群组活跃度和消息分析

### 4. 规则引擎

- **灵活规则**：基于规则链的消息处理
- **管理命令**：余额查询、消息撤回等管理功能
- **自定义指令**：支持扩展自定义命令

## 🛠️ 快速开始

### 环境要求

- **操作系统**：Linux/macOS（推荐Ubuntu 20.04+）
- **Docker**：20.10+
- **Docker Compose**：2.0+
- **内存**：4GB+（推荐8GB+）
- **磁盘空间**：20GB+

### 1. 克隆项目

```bash
git clone https://github.com/your-org/inner_bot_server.git
cd inner_bot_server
```

### 2. 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑环境变量
vim .env
```

**主要配置项**：

```bash
# 飞书机器人配置
MAIN_BOT_APP_ID=your_app_id
MAIN_BOT_APP_SECRET=your_app_secret
MAIN_VERIFICATION_TOKEN=your_verification_token
MAIN_ENCRYPT_KEY=your_encrypt_key

# 数据库配置
POSTGRES_USER=inner_bot
POSTGRES_PASSWORD=your_password
POSTGRES_DB=inner_bot_db
REDIS_PASSWORD=your_redis_password

# AI服务配置
OPENAI_API_KEY=your_openai_key
OPENAI_BASE_URL=https://api.openai.com/v1

# 搜索和表情包服务
SEARCH_API_KEY=your_search_key
BAIDU_TRANS_APPID=your_baidu_appid
BAIDU_TRANS_APIKEY=your_baidu_key

# 日志和监控
ELASTIC_PASSWORD=your_elastic_password
LOG_LEVEL=info
```

### 3. 启动服务

```bash
# 开发模式（前台运行，可查看日志）
make start-dev

# 生产模式（后台运行）
make start
```

### 4. 验证服务

```bash
# 检查服务状态
curl http://localhost:3000/api/health  # 主服务器

curl http://localhost:5601            # Kibana日志面板
```

## 📊 服务端口

| 服务 | 端口 | 描述 |
|------|------|------|
| Main Server | 3000 | 主服务器HTTP接口 |

| PostgreSQL | 5432 | 主数据库 |
| MongoDB | 27017 | 消息存储 |
| Redis | 6379 | 缓存和事件队列 |
| Elasticsearch | 9200 | 搜索引擎 |
| Kibana | 5601 | 日志可视化 |
| Logstash | 5044,5000,9600 | 日志处理 |
| Meme Service | 2233 | 表情包生成 |

## 🔧 管理命令

### 服务管理

```bash
# 启动所有服务
make start

# 开发模式启动
make start-dev

# 停止所有服务
make down

# 重启单个服务
make restart-service

# 重启有变更的服务
make restart-changed

# 完全重启
make restart-full
```

### 部署命令

```bash
# 生产环境部署
make deploy

# 自动化部署
make deploy-live
```

### 日志查看

```bash
# 查看主服务器日志
docker logs inner_bot_server-app-1 -f

# 查看所有服务日志
docker compose logs -f
```

## 🎮 使用指南

### 基本命令

在飞书中@机器人并发送以下命令：

```text
@机器人 帮助           # 查看帮助信息
@机器人 你好           # 开始对话
@机器人 发图 二次元     # 搜索并发送图片
@机器人 水群           # 查看群聊统计
@机器人 查重           # 检查消息重复
@机器人 撤回           # 撤回机器人消息
```

### 管理员命令

```text
@机器人 余额           # 查看API余额
@机器人 开启复读       # 开启群组复读功能
@机器人 关闭复读       # 关闭群组复读功能
```

### 高级功能

- **智能对话**：直接@机器人开始对话，支持上下文记忆
- **工具调用**：机器人会根据需要自动调用搜索、计算等工具
- **流式回复**：支持实时流式对话体验
- **多模态**：支持文本、图片等多种输入方式

## 🏥 健康检查

系统提供完整的健康检查功能：

```bash
# 运行健康检查脚本
./scripts/health_check.sh

# 查看健康检查日志
tail -f /var/log/inner_bot_server/health_check.log
```

健康检查包括：

- 服务可用性检查
- 数据库连接状态
- 外部API服务状态
- 系统资源使用情况

## 📈 监控和日志

### 日志系统

- **Elasticsearch**：存储和索引所有日志
- **Logstash**：处理和转换日志数据
- **Kibana**：可视化日志分析面板

访问 `http://localhost:5601` 查看日志面板。

### 性能监控

- 请求响应时间
- 数据库查询性能
- 内存和CPU使用率
- 错误率和异常统计

## 🚀 部署指南

### 开发环境部署

详见 [开发环境部署](docs/deployment.md#开发环境部署)

### 生产环境部署

详见 [生产环境部署](docs/deployment.md#生产环境部署)

### 自动化部署

支持自动化部署，详见 [自动部署系统](docs/auto_deploy.md)

## 📚 文档

- [部署指南](docs/deployment.md) - 详细的部署说明
- [事件系统](docs/event_system.md) - 事件系统使用指南
- [健康检查](docs/health_check.md) - 健康检查系统说明
- [自动部署](docs/auto_deploy.md) - 自动部署配置

## 🛡️ 安全性

- **权限控制**：细粒度的用户和群组权限管理
- **API密钥管理**：安全的密钥存储和轮换
- **输入验证**：严格的输入验证和过滤
- **日志脱敏**：敏感信息自动脱敏

## 🔄 开发指南

### 代码规范

- **TypeScript**：使用严格模式，遵循ESLint规范

- **提交信息**：遵循[语义化提交规范](https://www.conventionalcommits.org/)
- **代码审查**：所有代码变更需要经过代码审查

### 扩展功能

- **添加新规则**：在`main-server/src/services/message-processing/rules/`中添加

- **集成外部服务**：在`services/integrations/`中添加新集成

## 📄 许可证

本项目采用 [MIT许可证](LICENSE)。
