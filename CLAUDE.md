# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Lark (飞书) chatbot monorepo with three services: a Node.js/TypeScript main server handling Lark events and media processing, a Python/FastAPI AI service for LLM-powered dialogue with tool calling, and a Node.js cronjob service for scheduled tasks (Pixiv downloads, Bangumi sync, photo delivery).

## Monorepo Structure

- **apps/main-server** — Koa HTTP server, Lark SDK integration, rule engine, media processing (TypeScript)
- **apps/ai-service** — FastAPI, LangGraph agents, vector search, memory system, ArQ workers (Python)
- **apps/cronjob** — Scheduled tasks via node-cron (TypeScript, runs on separate machine)
- **apps/deploy-mcp** — FastMCP server for remote deployment & observability (Python, runs on production machine)
- **packages/ts-shared** (`@inner/shared`) — TypeScript shared utilities (cache, logger, HTTP, MongoDB)
- **packages/py-shared** (`inner-shared`) — Python shared utilities (decorators, middlewares, logging)
- **packages/lark-utils** — Lark API wrapper
- **packages/pixiv-client** — Pixiv API client
- **infra/main/compose/** — Docker Compose files split into `docker-compose.infra.yml` and `docker-compose.apps.yml`
- **schema/** — PostgreSQL schema managed by Atlas

## Build & Run Commands

### Full stack (Docker Compose via Makefile)
```bash
make start          # Build and start all services (daemon)
make start-dev      # Build and start (foreground, for debugging)
make down           # Stop all services
make deploy         # Rolling update: infra → logs → apps (with sleep between phases)
make deploy-live    # Incremental update (only changed services)
make db-sync        # Apply PostgreSQL schema via Atlas (requires .env)
make health-check   # Run health check script
```

The Makefile uses two compose files via: `docker compose --env-file .env -f infra/main/compose/docker-compose.infra.yml -f infra/main/compose/docker-compose.apps.yml`

### Main Server (apps/main-server)
```bash
npm run start         # Run with ts-node
npm run build         # tsc && tsc-alias
npm run lint          # ESLint
npm run lint:fix      # ESLint with auto-fix
npm run format        # Prettier
npm run test          # Jest (--runInBand)
npm run test:watch    # Jest watch mode
npm run test:coverage # Jest with coverage
```

Single test: `cd apps/main-server && npx jest src/path/to/file.test.ts`

### AI Service (apps/ai-service)
```bash
cd apps/ai-service
uv sync                           # Install dependencies
uv run pytest                     # Run all tests
uv run pytest tests/path/test_x.py  # Run single test file
uv run pytest -m unit             # Run only unit tests (markers: unit, integration, slow, api)
uv run ruff check .               # Lint
uv run ruff check --fix .         # Lint with auto-fix
uv run ruff format .              # Format
```

### Cronjob (apps/cronjob)
```bash
npm run build    # tsc
npm run dev      # tsx (development)
npm run start    # node dist/index.js
```

## Architecture

### Service Communication

```
Lark Events → Main Server (port 3001) → SSE streaming → AI Service (port 8000)
```

- Main Server receives Lark webhook events, routes through a rule engine, and streams AI requests via SSE to AI Service
- AI Service runs LangGraph agents with tool calling, returns streaming responses
- Both services share `.env` from repo root; internal auth uses Bearer token (`INNER_HTTP_SECRET`)
- Trace IDs propagate between services via `x-trace-id` header

### Infrastructure (Docker Compose)

Services: PostgreSQL 17.2, MongoDB, Redis 6.2, Elasticsearch 7.17.13, Kibana, Qdrant, Logstash, Meme Generator

App containers: `ai-app` (FastAPI), `app` (Koa), `ai-service-arq-worker` (async tasks), `vectorize-worker` (Redis stream consumer for message vectorization)

### Main Server Architecture (apps/main-server/src/)

Layered: `api/` (routes) → `core/` (business logic, rule engine, services) → `infrastructure/` (dal/TypeORM entities, cache/Redis, integrations/Lark+Aliyun+Volcengine, logger/Winston). Path aliases configured in tsconfig (`@core/`, `@api/`, `@infrastructure/`, `@dal/`, `@entities/`, `@utils/`, etc.).

### AI Service Architecture (apps/ai-service/app/)

`api/` (FastAPI routes) → `agents/` (LangGraph graphs, tools, clients) → `services/` (chat, extraction, memory) → `orm/` (SQLAlchemy models). Workers in `workers/` process async tasks via ArQ (Redis backend). Memory system uses Qdrant for vector search.

## Code Style

### Python (AI Service)
- Ruff for linting and formatting (line-length 88, double quotes)
- Rules: E, W, F, I, B, C4, UP; E501 ignored
- Target: Python 3.11
- Async-first: pytest uses `--asyncio-mode=auto`

### TypeScript (Main Server)
- ESLint + Prettier
- CommonJS modules, ES2022 target
- Decorators enabled (TypeORM)

### Pre-commit Hooks
Configured in `.pre-commit-config.yaml`: Ruff lint+format for Python, ESLint+build check for main-server, Docker Compose build validation for app services.

## Key Patterns

- **Long tasks**: PostgreSQL-based async task framework with ArQ integration (see `docs/long_tasks.md`)
- **Rate limiting**: Token bucket with async-mutex (main-server), sliding window (cronjob)
- **Logging**: Winston (main-server) and python-json-logger (AI service) → Logstash → Elasticsearch → Kibana
- **LLM observability**: Langfuse for tracing, prompt versioning, and evaluation
- **Database migrations**: Atlas CLI syncs `schema/` directory to PostgreSQL (`make db-sync`)
- **MultiBot**: Main server supports multiple Lark bot accounts

## Environment

All services load from root `.env` (see `.env.example`). Key variable groups: PostgreSQL, MongoDB, Redis, Lark credentials, AI service endpoints, Qdrant, Langfuse, external API keys.

Health endpoints: Main Server `/api/health`, AI Service `/health`.

## AI Pair Programming Workflow

### Post-Implementation Checklist

After making changes, follow this verification flow — do not skip steps:

1. **Local verification** (choose based on change scope):
   - Single-service logic change → run that service's unit tests
   - Cross-service change (RabbitMQ/SSE/HTTP calls) → run integration tests
   - Docker/infra config change → verify with `docker build`
   - DB schema change → verify locally with `make db-sync`

2. **Push & Deploy**:
   - `git push`
   - Call the `deploy` MCP tool to trigger production deployment (do not wait for cron)
   - Call `wait_for_healthy` to confirm all containers started successfully

3. **Post-deploy observation** (mandatory):
   - `es_get_error_logs(last_minutes=3, service=<changed service>)` — check for new errors
   - `get_container_status()` — check container restarts (restart_count > 0 = problem)
   - No errors → inform user "Deployed and verified, service is healthy"
   - Errors found → analyze logs, fix, restart from step 1

4. **When post-deploy checks fail**:
   - Use `es_get_log_context` to get full surrounding context
   - Fix locally + run tests
   - Never push an untested fix
   - Re-deploy + re-verify

### Do NOT auto-deploy these changes (ask user first)

- Infrastructure service config changes (postgres/redis/es)
- `.env` or secret changes
- Dockerfile base image changes
