# AGENTS 概览（Inner Bot Server）

本文件面向协作代理与工程师，帮助快速理解项目架构、规范与运行方式，以便开展开发、重构、测试与调试工作。内容严格基于仓库内文档与代码，不包含外推信息。

## 1. 项目概览

- 目标与能力
  - 飞书机器人服务，支持智能对话、Pixiv图片搜索、群组管理与媒体处理（README.md:7-11）。
- 分层与组件
  - 应用层
    - Main Server（Node.js/TypeScript/Koa）：飞书集成、规则处理、媒体处理、HTTP API（README.md:27-33；apps/main-server/package.json:7-13）。
    - AI Service（Python/FastAPI）：对话引擎、工具调用、记忆管理、向量检索（README.md:27-33；apps/ai-service/app/main.py:16-35）。
  - 基础设施层：PostgreSQL、MongoDB、Redis、Elasticsearch、Logstash、Kibana、Qdrant、Meme生成器（docker-compose.yml:78-139）。
- 服务拓扑（docker-compose）
  - ai-app（8000/tcp）: AI HTTP 服务（docker-compose.yml:3-12）。
  - app（3001→3000）: 主服务（docker-compose.yml:25-47）。
  - ai-service-arq-worker: 异步任务执行（arq），使用 uv 运行（docker-compose.yml:140-161）。
  - 数据存储与检索：redis、mongo、postgres、qdrant、elasticsearch（docker-compose.yml:48-93, 127-139）。
  - 日志链路：logstash、kibana（docker-compose.yml:94-126），主/AI 服务日志挂载卷（docker-compose.yml:106-110, 10-11, 40）。
- 关键子系统
  - 长期任务框架：基于 PostgreSQL + arq 的多步骤任务与分布式锁（docs/long_tasks.md）。
  - 记忆系统与向量检索：Qdrant 初始化在 AI 应用生命周期中进行（apps/ai-service/app/main.py:21；app/services/qdrant 目录）。

## 2. 构建与命令

- Makefile（顶层）
  - 启动：`make start`（后台构建与启动，docker compose up -d --build）（Makefile:4-6）。
  - 开发模式：`make start-dev`（前台运行）（Makefile:7-9）。
  - 停止：`make down`（Makefile:10-12）。
  - 重启：`make restart-service`（单服务）、`make restart-changed`、`make restart-full`（Makefile:13-29）。
  - 部署：`make deploy`（分批滚动更新，含基础设施/日志/应用分阶段）（Makefile:30-42），`make deploy-live`（仅更新变更服务并记录部署历史）（Makefile:43-56）。
  - 监控/巡检：`make health-check`、`make health-check-setup`、`make monitoring-setup`（Makefile:70-86, 101-103）。
  - 数据库 schema 同步：`make db-sync`（Atlas，依赖 .env）（Makefile:87-99）。
- Main Server（Node/TS）
  - 启动：`npm run start`（ts-node）（apps/main-server/package.json:7-9）。
  - 构建：`npm run build`（tsc + tsc-alias）（apps/main-server/package.json:9）。
  - 代码检查/修复：`npm run lint`、`npm run lint:fix`（apps/main-server/package.json:11-12）。
  - 格式化：`npm run format`（Prettier）（apps/main-server/package.json:10）。
- AI Service（Python/FastAPI）
  - 依赖与工具：`pyproject.toml` 指定 fastapi、sqlalchemy、qdrant-client、arq、ruff、pytest 等（apps/ai-service/pyproject.toml:6-41, 56-69）。
  - 包索引镜像与策略：`uv.toml`（aliyun 镜像；允许 insecure host mirrors.aliyun.com）（apps/ai-service/uv.toml:1-7）。
  - Worker 启动（容器内示例）：`uv run --no-sync arq app.workers.unified_worker.UnifiedWorkerSettings`（docker-compose.yml:140-146）。

## 3. 代码风格与最佳实践（项目内显式配置）

- Python（AI Service）
  - Ruff（lint+format）：选择 E/W/F/I/B/C4/UP；行宽 88；per-file-ignores；quote-style=double（apps/ai-service/ruff.toml:3-12, 44-68, 70-72）。
  - 类型检查：Pyright（basic），缺失导入警告、虚拟环境配置与路径（apps/ai-service/pyrightconfig.json:14-28）。
- TypeScript（Main Server）
  - ESLint：基于 @eslint/js 推荐与 @typescript-eslint 插件；关闭若干严格规则；警告级 no-unused-vars/no-console；忽略 dist/node_modules（apps/main-server/eslint.config.js:5-59）。
  - Prettier：lint-staged 针对 src/**/*.ts 写入格式（apps/main-server/package.json:14-18）。
- 路径别名（现状与建议）
  - 当前 tsconfig 路径别名（文档示例，baseUrl=src；paths 多别名）（docs/main-server-refactoring.md:57-71）。
  - 文档建议扩展别名集合以便重构（docs/main-server-refactoring.md:76-103）。

## 4. 测试

- 框架与约定（AI Service）
  - Pytest 配置：tests 目录；文件/类/函数命名约定；异步模式；覆盖率输出到 term 与 htmlcov；markers: slow/integration/unit/api（apps/ai-service/pytest.ini:1-19）。
  - 运行建议：在 ai-service 环境中执行 `pytest`（覆盖率阈值当前为 0，用于生成报告而不阻塞）（apps/ai-service/pytest.ini:11-14）。
- 依赖分组包含测试工具：pytest、pytest-asyncio、pytest-xdist、pytest-cov 等（apps/ai-service/pyproject.toml:56-69）。
- Main Server：仓库内未发现显式测试脚本/配置（基于当前文件与 package.json）。

## 5. 安全与数据保护

- 认证与鉴权
  - Bearer 鉴权中间件：校验 `Authorization: Bearer <token>` 与 `INNER_HTTP_SECRET`（apps/main-server/src/middleware/auth.ts:6-29）。
  - 内部通信密钥：AI Service 配置项包含 `inner_http_secret`（apps/ai-service/app/config/config.py:24-25）。
- 输入验证
  - 请求体验证/查询参数验证中间件：统一字段规则（必填、类型、长度、正则、自定义）（apps/main-server/src/middleware/validation.ts:35-80, 85-144）。
  - 示例规则：图片处理与 base64 上传字段约束（apps/main-server/src/middleware/validation.ts:147-200）。
- 速率限制
  - 互斥与时间窗口：令牌队列 + async-mutex（apps/main-server/src/utils/rate-limiting/rate-limiter.ts:3-14, 22-57）。
- 追踪与上下文
  - TraceId 传播：UUID 或请求头 `x-trace-id`，通过 AsyncLocalStorage 贯穿中间件链（apps/main-server/src/middleware/trace.ts:5-13）。
  - AI Service HeaderContextMiddleware：用于请求头上下文（apps/ai-service/app/main.py:30-35）。
- 日志
  - AI Service：JSON 结构化日志，控制台与文件（滚动），路径 `/logs/apps/ai-service/app.log`（apps/ai-service/app/config/logging_config.json:5-25, 27-53）。
  - Main Server：支持文件日志（环境变量控制，映射到 `/var/log/main-server`）（docker-compose.yml:34-41）。
- 敏感配置与凭据
  - docker-compose 使用 env_file `.env`，各服务密码通过环境变量注入（docker-compose.yml:37-45, 82-87, 118-121）。
  - Elasticsearch 启用 xpack 与密码（docker-compose.yml:80-87）。
  - Redis 启用 requirepass（docker-compose.yml:54-56）。
  - Qdrant API 密钥通过环境变量传入（docker-compose.yml:135-138）。
- 生产安全运行手册（文档）
  - 变更与部署自动化：自动部署脚本含锁与超时、飞书通知（docs/auto_deploy.md；scripts/auto_deploy.sh:7-17, 43-59, 145-166）。
  - 健康检查与告警：多维检查、异常节流、飞书通知（docs/health_check.md；scripts/health_check.sh:81-118, 381-484）。

## 6. 配置与环境管理

- 统一环境文件
  - `.env`：主服务、AI 服务、基础设施均从根目录 `.env` 加载（docker-compose.yml:37-38, 100；apps/ai-service/app/config/config.py:47-49；scripts/* 加载 .env）。
- AI Service 应用配置（pydantic Settings）
  - Redis/PG/Qdrant/搜索与对接凭据、主服务 URL、Langfuse、L2/L3 策略、长期任务批量与锁（apps/ai-service/app/config/config.py:5-46）。
- 生命周期与初始化
  - AI Service 应用启动时初始化 Qdrant 集合（apps/ai-service/app/main.py:21）。
- 数据库 schema
  - Atlas 迁移：`make db-sync` 从 `schema/` 应用到 PostgreSQL（Makefile:87-99）。
- 运维脚本
  - 自动部署与健康检查均可通过 Make 设定 crontab（Makefile:57-69, 74-85）。
- 端口与暴露
  - 详见部署文档端口表（docs/deployment.md:94-104）。

## 7. 运行与调试要点

- 容器日志采集：logstash 读取 AI/Main Server 映射卷用于集中日志（docker-compose.yml:106-110）。
- 健康端点：Main Server `/api/health`（docs/health_check.md:25），AI Service `/health`（docs/health_check.md:26）。
- 任务执行器：arq worker 按 cron 轮询与执行（docs/long_tasks.md:326-334）。
- 监控阈值：磁盘>85%、CPU/核>1.5、内存>90%告警（scripts/health_check.sh:266-283, 285-321）。

## 8. 辅助与协作规则

- 未检测到 Cursor/Copilot/Trae 规则文件（.cursor/rules、.github/copilot-instructions.md、.trae/rules）。如后续添加，请同步更新本文件关键要点。

