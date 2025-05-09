# 部署指南

本文档详细说明了如何在开发环境和生产环境中部署 Inner Bot Server。

## 开发环境部署

### 前置条件

确保您的开发环境满足以下要求：

- Node.js >= 16
- Python >= 3.8
- Docker Desktop
- Git

### 步骤

1. 克隆代码仓库：

```bash
git clone code.byted.org/yuanzhihong.chiwei/inner_bot_server.git
cd inner_bot_server
```

2. 配置环境变量：

```bash
cp .env.example .env
```

编辑 `.env` 文件，设置必要的环境变量：

```
# Redis 配置
REDIS_HOST=localhost
REDIS_PORT=6379

# 服务端口配置
MAIN_SERVER_PORT=8000
AI_SERVICE_PORT=8001

# 日志配置
LOG_LEVEL=DEBUG
```

3. 启动开发环境：

```bash
# 前台启动（可以看到实时日志）
make start-dev

# 后台启动
make start
```

4. 服务管理命令：

```bash
# 停止所有服务
make down

# 重启单个服务（交互式）
make restart-service

# 重启有代码变更的服务
make restart-changed

# 完全重启所有服务
make restart-full
```

## 生产环境部署

### 系统要求

- Linux 服务器（推荐 Ubuntu 20.04 LTS 或更高版本）
- Docker Engine >= 20.10
- Docker Compose >= 2.0
- 4GB RAM（最小）
- 20GB 磁盘空间（最小）

### 安装步骤

1. 安装 Docker（如果尚未安装）：

```bash
curl -fsSL https://get.docker.com | sh
```

2. 安装 Docker Compose（如果尚未安装）：

```bash
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

3. 创建部署目录：

```bash
mkdir -p /opt/inner_bot_server
cd /opt/inner_bot_server
```

4. 配置环境变量：

```bash
cp .env.example .env
```

编辑 `.env` 文件，设置生产环境配置：

```
# Redis 配置（建议使用独立的 Redis 服务）
REDIS_HOST=your-redis-host
REDIS_PORT=6379

# 服务端口配置
MAIN_SERVER_PORT=80
AI_SERVICE_PORT=8001

# 日志配置
LOG_LEVEL=INFO

# 其他生产环境特定配置
...
```

5. 部署服务：

```bash
# 生产环境滚动更新（推荐）
make deploy
```

这个命令会执行以下步骤：

- 拉取最新代码
- 构建服务镜像
- 按顺序更新各个服务：
  1. 基础设施服务（Redis、MongoDB、PostgreSQL、Elasticsearch）
  2. 日志相关服务（Logstash、Kibana）
  3. 应用服务（AI 服务、主服务等）

### 监控和维护

1. 日志管理：

```bash
# 查看所有服务日志
docker compose logs -f

# 查看特定服务的日志
docker compose logs -f <service-name>
```

2. 服务管理：

```bash
# 重启单个服务
make restart-service

# 重启有代码变更的服务
make restart-changed

# 完全重启所有服务
make restart-full
```

### 备份策略

1. 数据备份：
   - 定期备份 Redis 数据
   - 备份环境配置文件
   - 保存自定义配置和修改

2. 建议使用 crontab 设置自动备份任务：

```bash
# 每天凌晨 2 点进行备份
0 2 * * * /path/to/backup-script.sh
```

## 故障排除

### 常见问题

1. 服务无法启动
   - 检查端口占用情况
   - 检查环境变量配置
   - 查看详细日志

2. Redis 连接失败
   - 验证 Redis 服务状态
   - 检查网络连接
   - 确认 Redis 配置正确

3. 性能问题
   - 检查系统资源使用情况
   - 优化 Docker 资源限制
   - 考虑扩展服务器资源

### 获取帮助

如遇到无法解决的问题，请：

1. 收集相关日志和错误信息
2. 描述问题发生的具体场景
3. 联系技术支持团队
