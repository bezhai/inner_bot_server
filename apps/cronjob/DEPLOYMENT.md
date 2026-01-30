# Cronjob 服务部署指南

本文档说明如何独立部署 cronjob 定时任务服务到外网服务器。

## 前置要求

### 外部服务

cronjob 需要连接以下外部服务：

1. **MongoDB** - 存储图片元数据、下载任务、Bangumi 数据
2. **Redis** - 缓存和任务队列管理
3. **飞书开放平台** - 消息推送

### 服务器要求

- Docker 和 Docker Compose
- 至少 512MB 内存
- 稳定的网络连接（需要访问 Pixiv、Bangumi API）

## 部署步骤

### 1. 克隆代码

```bash
git clone <repository-url>
cd inner_bot_server/apps/cronjob
```

### 2. 配置环境变量

创建 `.env` 文件：

```bash
cp .env.example .env
```

编辑 `.env` 文件，填写以下配置：

```bash
# MongoDB 连接（外部服务）
MONGO_URL="mongodb://username:password@your-mongo-host:27017/chiwei_bot"

# Redis 连接（外部服务）
REDIS_URL="redis://:password@your-redis-host:6379"

# 飞书开放平台配置
FEISHU_APP_ID="cli_xxxxxxxxxxxxxxxxxxxx"
FEISHU_APP_SECRET="your_feishu_app_secret_here"
SELF_CHAT_ID="oc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Bangumi API（可选）
BANGUMI_BASE_URL="https://api.bgm.tv"
BANGUMI_ACCESS_TOKEN="your_bangumi_access_token_here"
```

### 3. 构建和启动

使用 Makefile（推荐）：

```bash
# 构建镜像
make build

# 启动服务
make up

# 查看日志
make logs
```

或直接使用 docker-compose：

```bash
# 构建并启动
docker-compose up -d

# 查看日志
docker-compose logs -f cronjob
```

### 4. 验证部署

检查容器状态：

```bash
docker-compose ps
```

查看日志确认服务正常运行：

```bash
docker-compose logs -f
```

应该看到类似以下的日志：

```
cronjob  | MongoDB connected successfully
cronjob  | Redis connected successfully
cronjob  | Cron jobs scheduled
```

## 定时任务说明

服务启动后，以下定时任务会自动执行：

| 时间 | 任务 | 说明 |
|------|------|------|
| 每天 10:00 | Pixiv 图片下载 | 下载关注插画师的最新作品 |
| 每天 18:00 | 每日图片推送 | 向飞书群聊发送精选图片 |
| 每天 19:29 | 新图推送 | 发送当天新发现的优质图片 |

## 管理命令

### 查看日志

```bash
# 实时查看日志
make logs

# 或
docker-compose logs -f
```

### 重启服务

```bash
make restart

# 或
docker-compose restart
```

### 停止服务

```bash
make down

# 或
docker-compose down
```

### 更新服务

```bash
# 拉取最新代码
git pull

# 重新构建并启动
make build
make restart
```

## 故障排查

### 1. 连接 MongoDB 失败

**症状**：日志显示 "MongoDB connection failed"

**解决方案**：
- 检查 `MONGO_URL` 是否正确
- 确认 MongoDB 服务可访问
- 检查用户名密码是否正确
- 确认数据库名称存在

### 2. 连接 Redis 失败

**症状**：日志显示 "Redis connection failed"

**解决方案**：
- 检查 `REDIS_URL` 是否正确
- 确认 Redis 服务可访问
- 检查密码是否正确

### 3. 飞书消息发送失败

**症状**：日志显示 "Feishu API error"

**解决方案**：
- 检查 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET` 是否正确
- 确认 `SELF_CHAT_ID` 是正确的群聊 ID
- 检查飞书机器人是否在群聊中
- 确认机器人有发送消息的权限

### 4. Pixiv 下载失败

**症状**：日志显示 "Pixiv API error"

**解决方案**：
- 检查网络连接
- 可能需要配置代理
- Pixiv API 可能有限流，稍后重试

### 5. 容器无法启动

**症状**：`docker-compose ps` 显示容器状态为 Exit

**解决方案**：
```bash
# 查看详细错误日志
docker-compose logs cronjob

# 检查环境变量是否正确
cat .env

# 重新构建
make clean
make build
make up
```

## 监控和维护

### 日志管理

日志配置在 `docker-compose.yml` 中：
- 最大文件大小：10MB
- 保留文件数：3 个
- 总日志大小：约 30MB

### 磁盘空间

定期清理 Docker 资源：

```bash
# 清理未使用的镜像
docker image prune -a

# 清理未使用的容器
docker container prune

# 清理未使用的卷
docker volume prune
```

### 性能监控

查看容器资源使用：

```bash
docker stats chiwei-bot-cronjob
```

## 安全建议

1. **环境变量保护**：
   - 不要将 `.env` 文件提交到 Git
   - 使用强密码
   - 定期更换密钥

2. **网络安全**：
   - 使用 TLS/SSL 连接 MongoDB 和 Redis
   - 限制服务器的入站连接
   - 使用防火墙规则

3. **定期更新**：
   - 定期更新 Docker 镜像
   - 更新依赖包
   - 关注安全公告

## 备份和恢复

### 备份

重要数据存储在 MongoDB 中，建议定期备份：

```bash
# 备份 MongoDB
mongodump --uri="mongodb://username:password@host:27017/chiwei_bot" --out=/backup/$(date +%Y%m%d)
```

### 恢复

```bash
# 恢复 MongoDB
mongorestore --uri="mongodb://username:password@host:27017/chiwei_bot" /backup/20240101
```

## 联系支持

如遇到问题，请：
1. 查看日志文件
2. 检查环境变量配置
3. 参考故障排查章节
4. 提交 Issue 到项目仓库
