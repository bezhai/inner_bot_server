# Cronjob Service Makefile
# 用于独立部署 cronjob 服务

.PHONY: help
help:
	@echo "Cronjob Service Management"
	@echo ""
	@echo "Usage:"
	@echo "  make build      - 构建 Docker 镜像"
	@echo "  make up         - 启动服务"
	@echo "  make down       - 停止服务"
	@echo "  make restart    - 重启服务"
	@echo "  make logs       - 查看日志"
	@echo "  make clean      - 清理容器和镜像"
	@echo "  make dev        - 本地开发模式运行"

.PHONY: build
build:
	docker-compose build

.PHONY: up
up:
	docker-compose up -d

.PHONY: down
down:
	docker-compose down

.PHONY: restart
restart: down up

.PHONY: logs
logs:
	docker-compose logs -f

.PHONY: clean
clean:
	docker-compose down -v --rmi all

.PHONY: dev
dev:
	npm run dev