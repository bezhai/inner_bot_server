# 开发指南

本文档介绍如何搭建本地开发环境、代码规范和调试技巧。

## 环境要求

### 系统要求

- **Node.js**: 22.x 或更高版本
- **Python**: 3.13 或更高版本
- **Docker**: 20.x 或更高版本
- **Docker Compose**: 2.x 或更高版本

### 推荐工具

- **包管理器**: npm (Node.js), uv (Python)
- **IDE**: VS Code 或 WebStorm
- **数据库工具**: DBeaver, MongoDB Compass

## 本地开发环境搭建

### 1. 克隆代码

```bash
git clone https://github.com/your-org/inner_bot_server.git
cd inner_bot_server
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件，填写必要的配置：

```bash
# 飞书机器人配置
MAIN_BOT_APP_ID=your_app_id
MAIN_BOT_APP_SECRET=your_app_secret
MAIN_VERIFICATION_TOKEN=your_verification_token
MAIN_ENCRYPT_KEY=your_encrypt_key

# 数据库配置
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
POSTGRES_DB=inner_bot
POSTGRES_HOST=localhost

MONGO_URL=mongodb://localhost:27017/inner_bot
REDIS_URL=redis://localhost:6379

# AI 服务配置
AI_SERVER_HOST=localhost
AI_SERVER_PORT=8000
OPENAI_API_KEY=your_openai_key

# 内部通信密钥
INNER_HTTP_SECRET=your_secret
```

### 3. 启动基础设施

```bash
# 仅启动数据库和缓存服务
docker compose up -d postgres mongo redis elasticsearch qdrant
```

### 4. 安装依赖

#### Main Server (Node.js)

```bash
# 在项目根目录安装所有依赖
npm install

# 或进入 main-server 目录
cd apps/main-server
npm install
```

#### AI Service (Python)

```bash
cd apps/ai-service

# 使用 uv 安装依赖
uv sync

# 或使用 pip
pip install -e .
```

### 5. 数据库初始化

```bash
# 同步数据库 Schema
make db-sync
```

### 6. 启动服务

#### 开发模式（推荐）

```bash
# 终端 1: 启动 Main Server
cd apps/main-server
npm run start

# 终端 2: 启动 AI Service
cd apps/ai-service
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

#### Docker 模式

```bash
make start-dev
```

## 项目结构

```
inner_bot_server/
├── apps/                   # 应用服务
│   ├── main-server/       # 主服务 (Node.js)
│   ├── ai-service/        # AI 服务 (Python)
│   └── cronjob/           # 定时任务 (Node.js)
├── packages/               # 共享包
│   ├── ts-shared/         # TypeScript 公共模块
│   ├── lark-utils/        # 飞书工具包
│   ├── pixiv-client/      # Pixiv 客户端
│   └── py-shared/         # Python 公共模块
├── infra/                  # 基础设施配置
├── schema/                 # 数据库 Schema
├── scripts/                # 运维脚本
├── docs/                   # 文档
└── docker-compose.yml      # Docker 编排
```

## 代码规范

### TypeScript (Main Server)

#### ESLint 配置

项目使用 ESLint 进行代码检查，配置文件位于 `apps/main-server/eslint.config.js`。

```bash
# 检查代码
npm run lint

# 自动修复
npm run lint:fix
```

#### Prettier 格式化

```bash
npm run format
```

#### 命名规范

- **文件名**: kebab-case (`user-service.ts`)
- **类名**: PascalCase (`UserService`)
- **函数/变量**: camelCase (`getUserById`)
- **常量**: UPPER_SNAKE_CASE (`MAX_RETRY_COUNT`)

#### 路径别名

项目配置了路径别名，避免相对路径过长：

```typescript
// 使用别名
import { UserService } from '@/core/services/user';

// 而不是
import { UserService } from '../../../core/services/user';
```

### Python (AI Service)

#### Ruff 配置

项目使用 Ruff 进行代码检查和格式化，配置文件位于 `apps/ai-service/ruff.toml`。

```bash
# 检查代码
ruff check .

# 自动修复
ruff check --fix .

# 格式化
ruff format .
```

#### 类型检查

使用 Pyright 进行类型检查：

```bash
pyright
```

#### 命名规范

- **文件名**: snake_case (`user_service.py`)
- **类名**: PascalCase (`UserService`)
- **函数/变量**: snake_case (`get_user_by_id`)
- **常量**: UPPER_SNAKE_CASE (`MAX_RETRY_COUNT`)

## 调试技巧

### Main Server 调试

#### VS Code 配置

在 `.vscode/launch.json` 中添加：

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Main Server",
      "runtimeArgs": ["-r", "ts-node/register"],
      "args": ["${workspaceFolder}/apps/main-server/src/index.ts"],
      "env": {
        "NODE_ENV": "development"
      }
    }
  ]
}
```

#### 日志调试

```typescript
import { logger } from '@/infrastructure/logger';

logger.info('Processing message', { messageId, userId });
logger.error('Failed to process', { error: err.message });
```

#### TraceId 追踪

每个请求都会生成唯一的 TraceId，可以通过日志追踪完整请求链路：

```bash
# 查看特定 TraceId 的日志
docker compose logs -f app | grep "trace-id-xxx"
```

### AI Service 调试

#### VS Code 配置

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug AI Service",
      "type": "debugpy",
      "request": "launch",
      "module": "uvicorn",
      "args": ["app.main:app", "--reload", "--port", "8000"],
      "cwd": "${workspaceFolder}/apps/ai-service"
    }
  ]
}
```

#### 日志调试

```python
import logging

logger = logging.getLogger(__name__)
logger.info("Processing chat request", extra={"user_id": user_id})
```

### 数据库调试

#### PostgreSQL

```bash
# 连接数据库
docker compose exec postgres psql -U postgres -d inner_bot

# 查看表结构
\dt
\d+ table_name
```

#### MongoDB

```bash
# 连接数据库
docker compose exec mongo mongosh

# 查看集合
show collections
db.messages.find().limit(10)
```

#### Redis

```bash
# 连接 Redis
docker compose exec redis redis-cli

# 查看键
KEYS *
GET key_name
```

## 测试

### AI Service 测试

```bash
cd apps/ai-service

# 运行所有测试
pytest

# 运行特定测试
pytest tests/test_chat.py

# 带覆盖率
pytest --cov=app --cov-report=html
```

### 测试标记

```bash
# 仅运行单元测试
pytest -m unit

# 仅运行集成测试
pytest -m integration

# 跳过慢速测试
pytest -m "not slow"
```

## 常见问题

### 1. 端口被占用

```bash
# 查看端口占用
sudo lsof -i :3001 -i :8000

# 杀死进程
kill -9 <PID>
```

### 2. 数据库连接失败

确保数据库服务已启动：

```bash
docker compose ps
docker compose up -d postgres mongo redis
```

### 3. 依赖安装失败

```bash
# Node.js 清理缓存
rm -rf node_modules package-lock.json
npm install

# Python 清理缓存
rm -rf .venv
uv sync
```

### 4. TypeScript 编译错误

```bash
# 清理构建产物
rm -rf dist
npm run build
```

### 5. 飞书回调无法接收

- 确保服务器可以被飞书访问（公网 IP 或内网穿透）
- 检查飞书开放平台的事件订阅配置
- 验证 Verification Token 和 Encrypt Key 是否正确

## 开发工作流

### 1. 创建功能分支

```bash
git checkout -b feature/your-feature
```

### 2. 开发和测试

```bash
# 启动开发环境
make start-dev

# 运行测试
pytest  # AI Service
npm run lint  # Main Server
```

### 3. 提交代码

```bash
git add .
git commit -m "feat: add new feature"
```

### 4. 推送和创建 PR

```bash
git push origin feature/your-feature
```

## 有用的命令

```bash
# 查看所有服务状态
docker compose ps

# 查看服务日志
docker compose logs -f app
docker compose logs -f ai-app

# 重启单个服务
docker compose restart app

# 进入容器
docker compose exec app sh
docker compose exec ai-app bash

# 清理所有容器和数据
docker compose down -v
```
