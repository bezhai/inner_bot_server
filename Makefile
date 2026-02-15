# 可选：staging clone 放一个 .makerc 覆盖下面的变量
-include .makerc

COMPOSE ?= docker compose
COMPOSE_PROJECT ?=
COMPOSE_FILES ?= --env-file .env -f infra/main/compose/docker-compose.infra.yml -f infra/main/compose/docker-compose.apps.yml
DC := $(COMPOSE) $(if $(COMPOSE_PROJECT),-p $(COMPOSE_PROJECT),) $(COMPOSE_FILES)

# 部署服务分组（可通过环境变量覆盖）
INFRA_SERVICES ?= redis mongo postgres elasticsearch meme qdrant rabbitmq
LOG_SERVICES ?= logstash kibana
APP_SERVICES ?= ai-app app ai-service-arq-worker vectorize-worker recall-worker monitor-dashboard

generate-types:
	./idl/scripts/generate.sh

start:
	$(DC) up -d --build

start-dev:
	$(DC) up --build

down:
	$(DC) down

deploy-live:
	$(DC) build
	$(DC) up -d --no-deps --no-recreate $(INFRA_SERVICES)
	sleep 5
	$(DC) up -d --no-deps --no-recreate $(LOG_SERVICES)
	sleep 5
	$(DC) up -d --no-deps $(APP_SERVICES)
	echo "部署完成时间: $$(date)" >> /var/log/inner_bot_server/deploy_history.log

db-sync:
	@echo "正在同步数据库 schema..."
	@if [ -f .env ]; then \
		export $$(cat .env | grep -v '^#' | xargs) && \
		atlas schema apply \
			--url "postgres://$${POSTGRES_USER}:$${POSTGRES_PASSWORD}@$${POSTGRES_HOST}:$${POSTGRES_PORT:-5432}/$${POSTGRES_DB}?sslmode=disable" \
			--to "file://infra/main/database" \
			--dev-url "docker://postgres/15/dev"; \
	else \
		echo "错误: .env 文件不存在，请先创建并配置环境变量"; \
		exit 1; \
	fi

test-integration:
	cd apps/ai-service && uv run pytest -m integration --timeout=30

# deploy-mcp: runs as a systemd service on the host (not in Docker)
REPO_ROOT := $(shell pwd)

deploy-mcp-setup:
	cd apps/deploy-mcp && uv sync
	@echo "[Unit]" > /tmp/deploy-mcp.service
	@echo "Description=Deploy MCP Server (FastMCP SSE)" >> /tmp/deploy-mcp.service
	@echo "After=network.target docker.service" >> /tmp/deploy-mcp.service
	@echo "Wants=docker.service" >> /tmp/deploy-mcp.service
	@echo "" >> /tmp/deploy-mcp.service
	@echo "[Service]" >> /tmp/deploy-mcp.service
	@echo "Type=simple" >> /tmp/deploy-mcp.service
	@echo "WorkingDirectory=$(REPO_ROOT)/apps/deploy-mcp" >> /tmp/deploy-mcp.service
	@echo "EnvironmentFile=$(REPO_ROOT)/.env" >> /tmp/deploy-mcp.service
	@echo "Environment=DEPLOY_MCP_PORT=9099" >> /tmp/deploy-mcp.service
	@echo "ExecStart=$(REPO_ROOT)/apps/deploy-mcp/.venv/bin/python server.py" >> /tmp/deploy-mcp.service
	@echo "Restart=on-failure" >> /tmp/deploy-mcp.service
	@echo "RestartSec=5" >> /tmp/deploy-mcp.service
	@echo "" >> /tmp/deploy-mcp.service
	@echo "[Install]" >> /tmp/deploy-mcp.service
	@echo "WantedBy=multi-user.target" >> /tmp/deploy-mcp.service
	sudo cp /tmp/deploy-mcp.service /etc/systemd/system/deploy-mcp.service
	@rm /tmp/deploy-mcp.service
	sudo systemctl daemon-reload
	sudo systemctl enable --now deploy-mcp

deploy-mcp-staging-setup:
	cd apps/deploy-mcp && uv sync
	@echo "[Unit]" > /tmp/deploy-mcp-staging.service
	@echo "Description=Deploy MCP Server - Staging (FastMCP SSE)" >> /tmp/deploy-mcp-staging.service
	@echo "After=network.target docker.service" >> /tmp/deploy-mcp-staging.service
	@echo "Wants=docker.service" >> /tmp/deploy-mcp-staging.service
	@echo "" >> /tmp/deploy-mcp-staging.service
	@echo "[Service]" >> /tmp/deploy-mcp-staging.service
	@echo "Type=simple" >> /tmp/deploy-mcp-staging.service
	@echo "WorkingDirectory=$(REPO_ROOT)/apps/deploy-mcp" >> /tmp/deploy-mcp-staging.service
	@echo "EnvironmentFile=$(REPO_ROOT)/.env" >> /tmp/deploy-mcp-staging.service
	@echo "Environment=DEPLOY_MCP_PORT=9100" >> /tmp/deploy-mcp-staging.service
	@echo "Environment=DEPLOY_MCP_ENV=staging" >> /tmp/deploy-mcp-staging.service
	@echo "ExecStart=$(REPO_ROOT)/apps/deploy-mcp/.venv/bin/python server.py" >> /tmp/deploy-mcp-staging.service
	@echo "Restart=on-failure" >> /tmp/deploy-mcp-staging.service
	@echo "RestartSec=5" >> /tmp/deploy-mcp-staging.service
	@echo "" >> /tmp/deploy-mcp-staging.service
	@echo "[Install]" >> /tmp/deploy-mcp-staging.service
	@echo "WantedBy=multi-user.target" >> /tmp/deploy-mcp-staging.service
	sudo cp /tmp/deploy-mcp-staging.service /etc/systemd/system/deploy-mcp-staging.service
	@rm /tmp/deploy-mcp-staging.service
	sudo systemctl daemon-reload
	sudo systemctl enable --now deploy-mcp-staging

deploy-mcp-restart:
	cd apps/deploy-mcp && uv sync
	sudo systemctl restart deploy-mcp

deploy-mcp-logs:
	journalctl -u deploy-mcp -f --no-pager -n 50

deploy-mcp-status:
	systemctl status deploy-mcp
