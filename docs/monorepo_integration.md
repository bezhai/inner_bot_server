# Monorepo 整合说明

本文档说明如何将 `chiwei_bot` 和 `chiwei-bot-cronjob` 两个仓库整合到当前 monorepo 中。

## 整合内容

### 1. chiwei-bot-cronjob → apps/cronjob

定时任务服务，包含以下功能：
- Pixiv 图片下载
- Bangumi 动画数据同步
- 每日照片推送
- Redis 任务队列管理

**位置**: `apps/cronjob/`

**主要文件**:
- `src/index.ts` - 入口文件，配置定时任务
- `src/service/` - 业务逻辑
- `src/mongo/` - MongoDB 数据访问层
- `src/redis/` - Redis 客户端
- `src/pixiv/` - Pixiv API 集成
- `src/lark.ts` - 飞书消息推送

### 2. chiwei_bot 基础设施配置

基础设施配置已整合到 `infra/` 目录：
- Redis 配置文件: `infra/redis/redis.conf`
- Docker Compose 配置已合并到 `infra/compose/docker-compose.infra.yml`

## 环境变量配置

在根目录的 `.env` 文件中添加以下配置：

```bash
# Cronjob 服务
MONGO_URL="mongodb://username:password@localhost:27017/chiwei_bot"
REDIS_URL="redis://localhost:6379"
FEISHU_APP_ID="your_app_id"
FEISHU_APP_SECRET="your_app_secret"
SELF_CHAT_ID="your_chat_id"
BANGUMI_BASE_URL="https://api.bgm.tv"
```

## 运行方式

### 开发环境

```bash
# 安装依赖
npm install

# 进入 cronjob 目录
cd apps/cronjob

# 开发模式运行
npm run dev
```

### 生产环境（独立部署）

cronjob 服务设计为独立部署到外网，不依赖其他服务的 docker-compose：

```bash
# 进入 cronjob 目录
cd apps/cronjob

# 构建并启动
make build
make up

# 或使用 docker-compose
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

**注意**：cronjob 连接外部的 MongoDB 和 Redis 服务，需要在 `.env` 中配置正确的连接字符串。

## 定时任务配置

定时任务在 `apps/cronjob/src/index.ts` 中配置：

- **10:00 每天**: 下载新的 Pixiv 作品
- **18:00 每天**: 发送每日照片
- **19:29 每天**: 发送新照片

## 数据库

### MongoDB 集合

- `bangumi_subjects` - Bangumi 动画数据
- `download_tasks` - 下载任务队列
- `photos` - 照片元数据

### Redis 键

- `download_user_dict` - 用户最后下载时间
- `ban_illusts` - 被屏蔽的作品 ID

## 注意事项

1. **独立部署**: cronjob 服务设计为独立部署，有自己的 docker-compose.yml
2. **外部服务**: cronjob 连接外部的 MongoDB 和 Redis，不依赖本地基础设施
3. **构建**: 使用 `skipLibCheck: true` 避免类型冲突
4. **时区**: 容器时区设置为 `Asia/Shanghai`
5. **日志**: 日志输出到标准输出，由 Docker 管理，保留最近 3 个文件，每个最大 10MB

## 下一步

- [ ] 将 cronjob 中的通用逻辑提取到 `packages/ts-shared`
- [ ] 添加健康检查端点
- [ ] 添加单元测试
- [ ] 配置 CI/CD 流程
