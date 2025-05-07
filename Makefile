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
