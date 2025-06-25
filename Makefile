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

# 完全重启（当前策略）
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
	docker compose up -d --no-deps redis mongo postgres elasticsearch
	sleep 10
	# 更新日志相关服务
	docker compose up -d --no-deps logstash kibana
	sleep 10
	# 最后更新应用服务
	docker compose up -d --no-deps ai-app app meme

# 用于自动部署的生产环境部署命令
deploy-live:
	# 只构建和更新有代码变更的服务
	docker compose build
	# 先更新基础设施服务（仅当有变更时）
	docker compose up -d --no-deps --no-recreate redis mongo postgres elasticsearch
	sleep 5
	# 更新日志相关服务（仅当有变更时）
	docker compose up -d --no-deps --no-recreate logstash kibana
	sleep 5
	# 最后更新应用服务（仅当有变更时）
	docker compose up -d --no-deps ai-app app meme
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

# 设置所有监控任务（自动部署和健康检查）
monitoring-setup: auto-deploy-setup health-check-setup
	@echo "所有监控任务已设置完成"

# === 多机器部署相关命令 ===

# 机器B - 启动记忆服务
memory-start:
	docker compose -f docker-compose.memory.yml up -d --build

# 机器B - 启动记忆服务（开发模式）
memory-start-dev:
	docker compose -f docker-compose.memory.yml up --build

# 机器B - 停止记忆服务
memory-down:
	docker compose -f docker-compose.memory.yml down

# 机器B - 重启记忆服务
memory-restart:
	docker compose -f docker-compose.memory.yml restart memory-service

# 机器B - 查看记忆服务日志
memory-logs:
	docker compose -f docker-compose.memory.yml logs -f memory-service

# 机器B - 更新记忆服务
memory-deploy:
	git pull
	docker compose -f docker-compose.memory.yml build
	# 先更新基础设施服务
	docker compose -f docker-compose.memory.yml up -d --no-deps redis-memory postgres-memory qdrant
	sleep 10
	# 更新记忆服务
	docker compose -f docker-compose.memory.yml up -d --no-deps memory-service memory-dashboard

# 机器B - 健康检查
memory-health:
	@echo "检查记忆服务健康状态..."
	@curl -f http://localhost:8080/health || echo "记忆服务不健康"
	@curl -f http://localhost:6333/health || echo "Qdrant不健康"
	@redis-cli -p 6380 -a $${REDIS_PASSWORD} ping || echo "Redis不健康"

# 机器B - 备份数据
memory-backup:
	@echo "开始备份记忆服务数据..."
	@mkdir -p ./backups
	docker compose -f docker-compose.memory.yml exec postgres-memory pg_dump -U $${POSTGRES_USER} $${POSTGRES_DB}_memory > ./backups/memory_backup_$$(date +%Y%m%d_%H%M%S).sql
	docker compose -f docker-compose.memory.yml exec qdrant tar -czf /tmp/qdrant_backup.tar.gz /qdrant/storage
	docker compose -f docker-compose.memory.yml cp qdrant:/tmp/qdrant_backup.tar.gz ./backups/qdrant_backup_$$(date +%Y%m%d_%H%M%S).tar.gz
	@echo "备份完成，文件保存在 ./backups/ 目录"
