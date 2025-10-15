generate-types:
	./idl/scripts/generate.sh

start:
	docker compose up -d --build

start-dev:
	docker compose up --build

down:
	docker compose down

# 只重启单个服务
restart-service:
	@read -p "请输入要重启的服务名: " service; \
	docker compose restart $$service

# 只重启有代码变更的服务
restart-changed:
	git pull
	docker compose up -d --build --no-deps

# 完全重启
restart-full:
	git pull
	docker compose build
	docker compose down
	docker compose up -d

# 生产环境滚动更新
deploy:
	git pull
	docker compose build
	# 先更新基础设施服务
	docker compose up -d --no-deps redis mongo postgres elasticsearch meme qdrant
	sleep 5
	# 更新日志相关服务
	docker compose up -d --no-deps logstash kibana
	sleep 5
	# 最后更新应用服务
	docker compose up -d --no-deps ai-app app ai-service-arq-worker

# 用于自动部署的生产环境部署命令
deploy-live:
	# 只构建和更新有代码变更的服务
	docker compose build
	# 先更新基础设施服务（仅当有变更时）
	docker compose up -d --no-deps --no-recreate redis mongo postgres elasticsearch meme qdrant
	sleep 5
	# 更新日志相关服务（仅当有变更时）
	docker compose up -d --no-deps --no-recreate logstash kibana
	sleep 5
	# 最后更新应用服务（仅当有变更时）
	docker compose up -d --no-deps ai-app app ai-service-arq-worker
	echo "部署完成时间: $$(date)" >> /var/log/inner_bot_server/deploy_history.log

# 设置自动部署定时任务（每3分钟检查一次）
auto-deploy-setup:
	@echo "正在设置自动部署定时任务..."
	@crontab -l > /tmp/current_crontab || echo "" > /tmp/current_crontab
	@if grep -q "auto_deploy.sh" /tmp/current_crontab; then \
		echo "自动部署任务已存在，正在更新..."; \
		sed -i.bak '/auto_deploy.sh/d' /tmp/current_crontab; \
	fi
	@echo "*/3 * * * * $(shell pwd)/scripts/auto_deploy.sh >> /var/log/inner_bot_server/cron.log 2>&1" >> /tmp/current_crontab
	@crontab /tmp/current_crontab
	@echo "已添加自动部署定时任务，每3分钟执行一次"
	@rm -f /tmp/current_crontab /tmp/current_crontab.bak

# 手动执行健康检查
health-check:
	./scripts/health_check.sh

# 设置健康检查定时任务（每5分钟检查一次）
health-check-setup:
	@echo "正在设置健康检查定时任务..."
	@crontab -l > /tmp/current_crontab || echo "" > /tmp/current_crontab
	@if grep -q "health_check.sh" /tmp/current_crontab; then \
		echo "健康检查任务已存在，正在更新..."; \
		sed -i.bak '/health_check.sh/d' /tmp/current_crontab; \
	fi
	@echo "*/5 * * * * $(shell pwd)/scripts/health_check.sh >> /var/log/inner_bot_server/health_check_cron.log 2>&1" >> /tmp/current_crontab
	@crontab /tmp/current_crontab
	@echo "已添加健康检查定时任务，每5分钟执行一次"
	@rm -f /tmp/current_crontab /tmp/current_crontab.bak

# 数据库schema同步
db-sync:
	@echo "正在同步数据库schema..."
	@if [ -f .env ]; then \
		export $$(cat .env | grep -v '^#' | xargs) && \
		atlas schema apply \
			--url "postgres://$${POSTGRES_USER}:$${POSTGRES_PASSWORD}@$${POSTGRES_HOST}:5432/$${POSTGRES_DB}?sslmode=disable" \
			--to "file://schema" \
			--dev-url "docker://postgres/15/dev"; \
	else \
		echo "错误: .env 文件不存在，请先创建并配置环境变量"; \
		exit 1; \
	fi

# 设置所有监控任务（自动部署和健康检查）
monitoring-setup: auto-deploy-setup health-check-setup
	@echo "所有监控任务已设置完成"
