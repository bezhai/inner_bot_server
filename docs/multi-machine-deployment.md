# 多机器部署指南

本文档描述如何将inner_bot_server拆分为两个机器的部署架构。

## 架构概览

### 机器A (主服务器)

- **文件**: `docker-compose.yml`
- **服务**:
  - Main Server (Node.js应用)
  - AI Service (Python FastAPI)
  - MongoDB
  - Redis (主服务缓存)
  - PostgreSQL (主数据库)
  - Elasticsearch + Logstash + Kibana (日志系统)
  - Meme生成器

### 机器B (记忆服务器)

- **文件**: `docker-compose.memory.yml`
- **服务**:
  - Memory Service (Python FastAPI)
  - Redis (记忆服务缓存)
  - PostgreSQL (记忆数据库)
  - Qdrant (向量数据库)
  - Memory Dashboard (监控面板)

## 端口规划

### 机器A端口

| 服务 | 端口 | 描述 |
|------|------|------|
| Main Server | 3000 | 主应用服务 |
| AI Service | 8000 | AI聊天服务 |
| MongoDB | 27017 | MongoDB数据库 |
| Redis | 6379 | Redis缓存 |
| PostgreSQL | 5432 | PostgreSQL数据库 |
| Elasticsearch | 9200 | 搜索引擎 |
| Logstash | 5044, 5000, 9600 | 日志收集 |
| Kibana | 5601 | 日志可视化 |
| Meme Generator | 2233 | 表情包生成器 |

### 机器B端口

| 服务 | 端口 | 描述 |
|------|------|------|
| Memory Service | 8080 | 记忆服务API |
| Redis Memory | 6380 | 记忆服务缓存 |
| PostgreSQL Memory | 5433 | 记忆数据库 |
| Qdrant | 6333, 6334 | 向量数据库 |
| Memory Dashboard | 8081 | 记忆服务监控 |

## 部署步骤

### 1. 准备环境文件

确保两台机器都有相同的 `.env` 文件，包含以下关键配置：

```bash
# 数据库配置
POSTGRES_USER=your_postgres_user
POSTGRES_PASSWORD=your_postgres_password
POSTGRES_DB=your_database_name

# Redis配置
REDIS_PASSWORD=your_redis_password

# Elasticsearch配置
ELASTIC_PASSWORD=your_elastic_password

# MongoDB配置
MONGO_INITDB_ROOT_USERNAME=your_mongo_user
MONGO_INITDB_ROOT_PASSWORD=your_mongo_password
```

### 2. 机器A部署 (主服务)

```bash
# 克隆代码库
git clone <repository_url>
cd inner_bot_server

# 启动主服务
docker compose up -d

# 检查服务状态
docker compose ps
docker compose logs -f
```

### 3. 机器B部署 (记忆服务)

```bash
# 克隆代码库
git clone <repository_url>
cd inner_bot_server

# 启动记忆服务
docker compose -f docker-compose.memory.yml up -d

# 检查服务状态
docker compose -f docker-compose.memory.yml ps
docker compose -f docker-compose.memory.yml logs -f memory-service
```

### 4. 服务连接配置

需要在机器A的服务中配置机器B的记忆服务地址：

```bash
# 在机器A的.env文件中添加
MEMORY_SERVICE_URL=http://<机器B的IP>:8080
```

## 健康检查

### 机器A健康检查

```bash
# 主服务
curl http://localhost:3000/health

# AI服务
curl http://localhost:8000/health

# Elasticsearch
curl http://localhost:9200/_cluster/health
```

### 机器B健康检查

```bash
# 记忆服务
curl http://localhost:8080/health

# Qdrant
curl http://localhost:6333/health

# Redis
redis-cli -p 6380 -a $REDIS_PASSWORD ping
```

## 监控和日志

### 机器A监控

- **Kibana**: <http://机器A:5601>
- **Elasticsearch**: <http://机器A:9200>

### 机器B监控

- **Memory Dashboard**: <http://机器B:8081>
- **Qdrant Dashboard**: <http://机器B:6333/dashboard>

## 维护命令

### 停止服务

```bash
# 机器A
docker compose down

# 机器B
docker compose -f docker-compose.memory.yml down
```

### 更新服务

```bash
# 机器A
docker compose pull
docker compose up -d --build

# 机器B
docker compose -f docker-compose.memory.yml pull
docker compose -f docker-compose.memory.yml up -d --build
```

### 查看日志

```bash
# 机器A
docker compose logs -f [service_name]

# 机器B
docker compose -f docker-compose.memory.yml logs -f [service_name]
```

## 数据备份

### 机器A数据备份

```bash
# MongoDB备份
docker compose exec mongo mongodump --archive=/backup/mongo_backup.gz --gzip

# PostgreSQL备份
docker compose exec postgres pg_dump -U $POSTGRES_USER $POSTGRES_DB > backup.sql
```

### 机器B数据备份

```bash
# PostgreSQL备份
docker compose -f docker-compose.memory.yml exec postgres-memory pg_dump -U $POSTGRES_USER ${POSTGRES_DB}_memory > memory_backup.sql

# Qdrant备份
docker compose -f docker-compose.memory.yml exec qdrant tar -czf /tmp/qdrant_backup.tar.gz /qdrant/storage
```

## 故障排除

### 常见问题

1. **端口冲突**: 确保两台机器的端口配置不冲突
2. **网络连接**: 确保机器间网络畅通
3. **环境变量**: 检查`.env`文件配置是否正确
4. **依赖启动顺序**: 某些服务可能需要依赖服务先启动

### 调试命令

```bash
# 检查容器状态
docker ps -a

# 检查网络
docker network ls

# 检查卷
docker volume ls

# 进入容器调试
docker compose exec [service_name] /bin/bash
```
