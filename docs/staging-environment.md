# Staging Environment Plan

## Background

### Problem

当前开发流程中，push 到 master 等于上生产（cron 3 分钟自动部署），而大部分变更只能在生产环境被完整验证。这导致：

- 最近 50 个 commit 中 56% 是 fix（28/50）
- 出现多条 fix 链：deploy-mcp 连修 7 次、post-safety 连修 4 次
- 根因不是代码质量，而是**开发环境和生产运行时之间没有验证层**

### Why local testing is insufficient

系统深度依赖飞书 webhook 作为唯一输入，一条消息触碰 PostgreSQL、MongoDB、Redis、Qdrant、RabbitMQ 五个存储，加飞书 API、LLM API、Langfuse 三个外部服务，横跨 4 个进程。本地单元测试 mock 掉了这些依赖，也就 mock 掉了 bug。

### Goal

1. **减少试错本身**：让更多问题在部署到生产前被发现
2. **减少 fix 链长度**：feature branch + squash merge，master 历史干净

---

## Architecture

### Overview

```
同一台内网机器
├── /data/inner_bot_server/              ← 生产环境（现有）
│   ├── .env
│   └── docker compose (project: inner_bot_server)
│       ├── 基础设施: redis, postgres, mongo, es, qdrant, rabbitmq, ...
│       └── 应用服务: app:3001, ai-app:8000, workers
│
└── /data/inner_bot_server_staging/      ← 测试环境（新增）
    ├── .env.staging
    └── docker compose (project: inner_bot_staging)
        ├── 基础设施: redis, postgres, mongo, es, qdrant, rabbitmq, ...  (独立实例，不同端口)
        └── 应用服务: app:3003, ai-app:8001, workers
```

### Key decisions

| 决策 | 选择 | 理由 |
|------|------|------|
| 测试 bot 连接方式 | **WebSocket** (`init_type=websocket`) | 服务端主动连飞书，不需要公网入口/端口映射 |
| 基础设施隔离 | **独立 Compose project** | 完全隔离 volumes/networks/containers，不靠 db number 或 key prefix |
| 代码目录 | **独立 git clone** | 绝不在生产目录操作，staging 可以自由切分支 |
| 部署方式 | **手动，通过 staging deploy-mcp** | 区别于生产的自动 cron 部署 |
| 数据种子 | **最小种子 + 运行时自动填充** | 只需 `bot_config`（1行）+ `model_provider`（1-2行），其余由飞书事件自动同步 |

### Port mapping

生产和测试环境的端口规划（仅列出 host 发布端口，容器内部端口不变）：

| Service | Production (host port) | Staging (host port) |
|---------|----------------------|---------------------|
| main-server (app) | 3001 | 3003 |
| ai-service (ai-app) | 8000 | 8001 |
| PostgreSQL | 5432 | 5433 |
| MongoDB | 27017 | 27018 |
| Redis | 6379 | 6380 |
| Elasticsearch | 9200 | 9201 |
| Kibana | 5601 | — (staging 不需要) |
| Logstash | 5044/5000/9600 | — (staging 不需要) |
| Qdrant | 6333 | 6334 |
| RabbitMQ | 5672/15672 | 5673/15673 |
| Meme | 2233 | 2234 |
| deploy-mcp | 9099 | 9100 |
| monitor-dashboard | 3002 | — (staging 不需要) |

Staging 可以省略日志基建（Logstash/Kibana）和 monitor-dashboard，减少资源消耗。

### Data seeding (minimal)

系统启动只强依赖两张表：

```sql
-- 1. 测试 bot 配置（WebSocket 模式）
INSERT INTO bot_config (
  bot_name, app_id, app_secret, encrypt_key, verification_token,
  robot_union_id, init_type, is_active, is_dev
) VALUES (
  'test-bot', '<TEST_APP_ID>', '<TEST_APP_SECRET>', '<TEST_ENCRYPT_KEY>',
  '<TEST_VERIFICATION_TOKEN>', '<TEST_ROBOT_UNION_ID>', 'websocket', true, true
);

-- 2. LLM 供应商（可复用生产的 API key）
INSERT INTO model_provider (
  provider_id, name, api_key, base_url, client_type, is_active
) VALUES (
  gen_random_uuid(), 'openai', '<OPENAI_API_KEY>',
  'https://api.openai.com/v1', 'openai', true
);
```

其余表（lark_user, lark_group_chat_info, conversation_messages 等）在第一条飞书消息进来后自动填充。

---

## Pre-work: Making the Repo Staging-Friendly

在搭建测试环境之前，需要先消除代码中的硬编码，使同一套代码能通过不同的环境变量跑两个实例。

### Phase 1: Parameterize hardcoded values

#### 1.1 MongoDB database name "chiwei"

**现状**: 数据库名在 4 处硬编码，无环境变量控制。

| File | Line | Current |
|------|------|---------|
| `apps/main-server/src/infrastructure/dal/mongo/client.ts` | 26, 33 | `chiwei` in URL and `db('chiwei')` |
| `apps/monitor-dashboard/server/mongo.ts` | 37, 60 | `chiwei` in URL and `db('chiwei')` |
| `apps/cronjob/src/mongo/client.ts` | 72 | `database: 'chiwei'` |
| `packages/ts-shared/src/mongo/types.ts` | 28 | default param `= 'chiwei'` |

**改法**: 新增环境变量 `MONGO_DB_NAME`，默认值 `chiwei`（向后兼容）。

```typescript
// packages/ts-shared/src/mongo/types.ts
export function createDefaultMongoConfig(database?: string): MongoConfig {
  return {
    database: database ?? process.env.MONGO_DB_NAME ?? 'chiwei',
    // ...
  };
}
```

所有消费方改为读取统一配置，不再各自硬编码。

#### 1.2 Qdrant collection names

**现状**: `messages_cluster` 和 `messages_recall` 硬编码在 2 个文件中。

| File | Line | Collection |
|------|------|-----------|
| `apps/ai-service/app/services/qdrant.py` | 337 | `messages_cluster` |
| `apps/ai-service/app/workers/vectorize_worker.py` | 226, 234 | `messages_recall`, `messages_cluster` |

**改法**: 在 `app/config/config.py` 的 `Settings` 中新增配置项：

```python
qdrant_collection_messages_cluster: str = "messages_cluster"
qdrant_collection_messages_recall: str = "messages_recall"
```

消费方从 settings 读取。staging 可以设为 `staging_messages_cluster`，或者依赖 Compose project 级别的 Qdrant 隔离（独立实例），保持默认名不改。

#### 1.3 PostgreSQL port

**现状**: `5432` 硬编码在 2 处。

| File | Line | Current |
|------|------|---------|
| `apps/main-server/src/ormconfig.ts` | 6 | `port: 5432` |
| `apps/ai-service/app/config/config.py` | — | `postgres_port: int = 5432` (already configurable) |

**改法**: main-server 的 ormconfig 加 `POSTGRES_PORT` 环境变量，默认 5432。

```typescript
port: parseInt(process.env.POSTGRES_PORT ?? '5432'),
```

#### 1.4 Redis port

**现状**: `6379` 硬编码在 AI service Redis client。

| File | Line | Current |
|------|------|---------|
| `apps/ai-service/app/clients/redis.py` | ~22 | `port="6379"` |

**改法**: 从 settings 读取 `redis_port`（`config.py` 中需新增该字段，默认 6379）。

#### 1.5 deploy-mcp health endpoints

**现状**: `localhost:3001` 和 `localhost:8000` 硬编码。

| File | Line | Current |
|------|------|---------|
| `apps/deploy-mcp/server.py` | 35-38 | `HEALTH_ENDPOINTS` list |

**改法**: 从环境变量读取，默认保持不变。

```python
HEALTH_ENDPOINTS = [
    ("main-server", os.environ.get("HEALTH_URL_MAIN", "http://localhost:3001/api/health")),
    ("ai-service", os.environ.get("HEALTH_URL_AI", "http://localhost:8000/health")),
]
```

#### 1.6 deploy-mcp log paths

**现状**: 3 个日志路径硬编码在 server.py。

| File | Line | Current |
|------|------|---------|
| `apps/deploy-mcp/server.py` | 227-229 | `/var/log/inner_bot_server/deploy_history.log` 等 |

**改法**: 基于 `REPO_DIR` 或新增 `LOG_DIR` 环境变量推导。

```python
LOG_BASE = os.environ.get("DEPLOY_LOG_DIR", "/var/log/inner_bot_server")
```

### Phase 2: Compose overlay for staging

新增 `infra/staging/` 目录，不修改生产 compose 文件：

```
infra/staging/
├── docker-compose.override.yml   ← port overrides + 精简服务
├── .env.staging.example          ← staging 环境变量模板
└── seed.sql                      ← 种子数据 SQL
```

`docker-compose.override.yml` 只覆盖端口映射和不需要的服务：

```yaml
# 继承生产的 compose 文件，只 override 端口
services:
  app:
    ports:
      - "3003:3000"
  ai-app:
    ports:
      - "8001:8000"
  postgres:
    ports:
      - "5433:5432"
  redis:
    ports:
      - "6380:6379"
  mongo:
    ports:
      - "27018:27017"
  elasticsearch:
    ports:
      - "9201:9200"
  qdrant:
    ports:
      - "6334:6333"
  rabbitmq:
    ports:
      - "5673:5672"
      - "15673:15672"
  meme:
    ports:
      - "2234:2233"

  # staging 不需要日志基建和 dashboard
  logstash:
    profiles: ["disabled"]
  kibana:
    profiles: ["disabled"]
  monitor-dashboard:
    profiles: ["disabled"]
```

### Phase 3: Staging deploy-mcp

在生产机器上运行第二个 deploy-mcp 实例，指向 staging 目录：

- systemd service: `deploy-mcp-staging.service`
- Port: `9100`
- `REPO_DIR=/data/inner_bot_server_staging`
- `HEALTH_URL_MAIN=http://localhost:3003/api/health`
- `HEALTH_URL_AI=http://localhost:8001/health`
- `DEPLOY_LOG_DIR=/var/log/inner_bot_server_staging`

Makefile 中新增 `deploy-mcp-staging-setup` target（复用现有 `deploy-mcp-setup` 的逻辑，改端口和路径）。

---

## Setup Steps

### One-time setup

```bash
# 1. Clone staging repo
cd /data
git clone <repo-url> inner_bot_server_staging
cd inner_bot_server_staging

# 2. Create .env.staging (from template)
cp infra/staging/.env.staging.example .env

# 3. Apply database schema
make db-sync   # (points to staging postgres once it's up)

# 4. Start staging services
COMPOSE_PROJECT_NAME=inner_bot_staging \
docker compose --env-file .env \
  -f infra/main/compose/docker-compose.infra.yml \
  -f infra/main/compose/docker-compose.apps.yml \
  -f infra/staging/docker-compose.override.yml \
  up -d --build

# 5. Seed data
psql -h localhost -p 5433 -U <user> -d <staging_db> -f infra/staging/seed.sql

# 6. Set up staging deploy-mcp
make deploy-mcp-staging-setup
```

### Daily workflow

```
feature branch 开发
    │
    ├── 本地能跑的单元测试先跑（lint, build, unit test）
    │
    ├── push feature branch 到 GitHub
    │
    ▼
staging 验证
    │
    ├── 通过 staging deploy-mcp 部署 feature branch
    │   (Claude Code 连接 staging MCP → deploy)
    │
    ├── 在飞书上通过测试 bot 验证功能
    │   (test bot 用 WebSocket 连接 staging 的 main-server)
    │
    ├── 有问题 → 在 feature branch 上继续修
    │   (fix commits 只在 branch 上，不影响 master)
    │
    └── 验证通过
         │
         ▼
merge to master (squash merge)
    │
    ├── master 只有一条干净的 commit
    │
    └── 生产 cron 3 分钟内自动部署
```

### Staging deploy-mcp operations

staging deploy-mcp 需要支持的额外操作（相比生产版本）：

```python
# 切换分支并部署（生产版本只有 git pull）
@mcp.tool()
async def deploy_branch(branch: str, timeout: int = 600):
    """Checkout a specific branch and deploy to staging."""
    # git fetch → git checkout <branch> → git pull → make deploy-live
    ...
```

---

## Resource Impact

Staging 环境的额外资源消耗（省略 Logstash/Kibana/Dashboard 后）：

| Service | Memory (approx.) |
|---------|-----------------|
| PostgreSQL | ~200MB |
| MongoDB | ~200MB |
| Redis | ~50MB |
| Elasticsearch | ~2GB (可降到 1GB，staging 不需要大堆) |
| Qdrant | ~200MB |
| RabbitMQ | ~150MB |
| ai-app | ~500MB |
| app | ~200MB |
| 3 workers | ~300MB each |

**Total**: ~4-5GB additional memory。如果机器资源紧张：

- ES 可以不起（staging 日志直接看容器 stdout）
- Qdrant 可以不起（向量搜索功能降级但不影响主流程）
- 减少 worker 数量（只起一个 arq-worker）

最低配置约 **2-3GB**。

---

## Migration path

| Phase | Scope | Outcome | Status |
|-------|-------|---------|--------|
| **Phase 1** | Parameterize hardcodes (6 items) | Repo becomes staging-friendly | Done |
| **Phase 2** | Compose overlay + .env template + Makefile targets | Staging infra ready | Done |
| **Phase 3** | Staging deploy-mcp | Manual deploy via MCP | Next |
| **Phase 4** | Clone + setup + seed | Staging environment live | |
| **Phase 5** | 日常使用，迭代改进 | Workflow established | |

### Phase 2 deliverables

- `infra/staging/docker-compose.override.yml` — port remapping, ES heap 512m, disabled logstash/kibana/monitor-dashboard
- `infra/staging/.env.staging.example` — staging env var template (no DASHBOARD_* / log infra config)
- `Makefile` staging targets: `staging-start`, `staging-down`, `staging-deploy-live`, `staging-db-sync`, `deploy-mcp-staging-setup`
