# Infrastructure Configuration

## 服务部署

使用 Docker Compose 管理基础设施和应用服务。

### 启动服务

```bash
# 从项目根目录
make start          # 后台启动所有服务
make start-dev      # 前台启动（查看日志）
```

### 部署更新

```bash
make deploy         # 滚动更新（分阶段重启）
make deploy-live    # 增量更新（仅重启变更的服务）
```

## Kibana 时区配置

Kibana 已配置为默认显示北京时间 (Asia/Shanghai, UTC+8)。

- Elasticsearch 存储 UTC 时间（标准做法）
- Kibana 自动转换为北京时间显示
- 配置位置：`conf/kibana/kibana.yml` 中的 `uiSettings.overrides`

如需修改时区，可以：
1. 修改配置文件后重启服务
2. 或在 Kibana UI 中手动覆盖：Stack Management → Advanced Settings → `dateFormat:tz`

## 配置文件

- `conf/logstash/` - Logstash 配置
- `conf/kibana/` - Kibana 配置
- `compose/` - Docker Compose 文件

## 数据持久化

数据卷：
- `mongo_data` - MongoDB 数据
- `postgres_data` - PostgreSQL 数据
- `redis-data` - Redis 数据
- `elasticsearch_data` - Elasticsearch 索引
- `qdrant_data` - Qdrant 向量数据
- `ai_service_logs` - AI 服务日志
- `main_server_logs` - 主服务器日志
