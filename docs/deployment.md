# 部署指南

让 Inner Bot Server 在几分钟内运行起来！

## 🚀 快速部署

### 系统要求

- Docker & Docker Compose
- 2GB+ 内存
- 10GB+ 磁盘空间

### 部署步骤

1. **获取代码**

   ```bash
   git clone https://github.com/your-org/inner_bot_server.git
   cd inner_bot_server
   ```

2. **配置环境**

   ```bash
   cp .env.example .env
   vim .env
   ```

   **核心配置**（重点是飞书机器人凭证）：

   ```bash
   # 飞书机器人配置
   MAIN_BOT_APP_ID=你的机器人AppID
   MAIN_BOT_APP_SECRET=你的机器人Secret
   MAIN_VERIFICATION_TOKEN=你的验证Token
   MAIN_ENCRYPT_KEY=你的加密密钥

   # 数据库密码
   POSTGRES_PASSWORD=数据库密码
   MONGO_PASSWORD=MongoDB密码
   REDIS_PASSWORD=Redis密码
   ELASTIC_PASSWORD=Elasticsearch密码
   ```

3. **启动服务**

   ```bash
   make start        # 生产环境
   make start-dev    # 开发环境（前台运行）
   ```

4. **数据库初始化**

   ```bash
   make db-sync      # 首次部署或schema变更时需要
   ```

5. **验证部署**

   ```bash
   curl http://localhost/api/health      # 主服务
   curl http://localhost:8000/health     # AI服务
   docker compose logs -f                # 查看日志
   ```

### 基本使用

在飞书群中@机器人并发送命令：

```bash
@机器人 你好           # 开始对话
@机器人 发图 二次元     # 搜索图片
@机器人 水群           # 查看统计
@机器人 帮助           # 功能帮助
```

## 🏭 生产环境配置

### 环境准备（仅生产环境需要）

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装 Docker
curl -fsSL https://get.docker.com | sh
sudo systemctl enable docker && sudo systemctl start docker

# 安装 Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### 服务端口

| 服务 | 端口 | 说明 |
|------|------|------|
| Main Server | 3001 | 飞书机器人API |
| AI Service | 8000 | 智能对话服务 |
| PostgreSQL | 5432 | 用户数据 |
| MongoDB | 27017 | 消息存储 |
| Redis | 6379 | 缓存队列 |
| Elasticsearch | 9200 | 日志搜索 |
| Kibana | 5601 | 日志面板 |

## 🔧 运维管理

### 常用命令

```bash
# 启动/停止
make start              # 启动服务
make start-dev          # 开发模式启动
make down              # 停止所有服务

# 更新部署
make deploy            # 滚动更新
make restart-full      # 完全重启

# 日志和监控
docker compose logs -f              # 查看所有日志
docker compose logs -f app          # 主服务日志
curl http://localhost/api/health     # 健康检查
```

### 故障排除

**常见问题快速解决**：

- **服务无法启动**：检查端口占用 `sudo lsof -i :80 -i :3001 -i :8000`
- **Redis连接失败**：检查状态 `docker compose exec redis redis-cli ping`
- **内存不足**：清理资源 `docker system prune -a`
- **配置错误**：验证配置 `docker compose config`
- **数据库问题**：重新同步 `make db-sync`

## 📊 监控和日志

### 实时日志

```bash
docker compose logs -f           # 所有服务
docker compose logs -f app       # 主服务
docker compose logs -f ai-app    # AI服务
```

### 日志面板

访问 `http://your-server:5601` 查看 Kibana 日志面板

### 健康检查

```bash
make health-check               # 自动检查
curl http://localhost/health     # HTTP检查
```

## 🗄️ 数据库和安全

### 数据库管理

- 使用 `make db-sync` 同步数据库schema
- 主要数据表：`bot_config`、`lark_user`、`conversation_messages` 等
- schema定义在 `schema/` 目录

### 安全建议

1. 修改所有默认密码
2. 配置防火墙，只开放必要端口（80, 443）
3. 配置HTTPS证书
4. 定期备份数据库和配置
5. 监控异常日志

## 🚀 高级配置

如需自定义配置，请编辑：

- `docker-compose.yml` - 服务配置
- `.env` - 环境变量

性能优化示例：

```bash
# 增加ES内存限制
vim docker-compose.yml
# ES_JAVA_OPTS=-Xms2g -Xmx2g
```

## 📞 获取帮助

遇到问题时：

1. 查看日志：`docker compose logs -f`
2. 验证配置：`docker compose config`
3. 测试连接：`curl http://localhost/api/health`

相关文档：

- [健康检查系统](health_check.md)
- [自动部署系统](auto_deploy.md)
