# 健康检查系统

本文档介绍了Inner Bot Server项目的健康检查系统的设置和使用方法。

## 原理

健康检查系统通过定期检查各项服务的状态和可用性，监控系统的整体健康状况。一旦检测到问题，系统会自动发送飞书通知，及时提醒维护人员进行处理。

## 功能特点

1. 定时检查服务健康状态（每5分钟一次）
2. 多种检查方式：HTTP健康端点、TCP端口连通性、Docker容器状态
3. 服务特定的健康检查（如Redis的PING命令、Elasticsearch的集群状态）
4. 系统资源监控（CPU负载、内存使用率、磁盘空间）
5. 智能报警机制，避免通知轰炸
6. 详细的日志记录
7. 飞书通知 - 问题自动报警

## 检查项目

健康检查系统会检查以下服务的状态：

| 服务名称 | 检查方式 | 检查点 | 健康状态判断 |
|---------|---------|-------|------------|
| main-server | HTTP | <http://localhost:3000/api/health> | 返回状态码200 |
| ai-service | HTTP | <http://localhost:8000/health> | 返回状态码200 |
| redis | 专用检查 | localhost:6379 | 端口可连接 |
| mongo | 专用检查 | localhost:27017 | 端口可连接 |
| postgres | 专用检查 | localhost:5432 | 端口可连接 |
| elasticsearch | 专用检查 | localhost:9200 | 端口可连接，集群状态为green或yellow |
| qdrant | 专用检查 | 从环境变量读取配置（主机、端口和API密钥） | 端口可连接，使用API密钥尝试调用/healthz或/collections API |

此外，还会检查以下内容：

1. **Docker容器状态**：检查所有必要的容器是否在运行
   - app (main-server)
   - ai-app (ai-service)
   - redis
   - mongo
   - postgres
   - elasticsearch
   - logstash
   - kibana
   - meme
   - qdrant

2. **系统资源状态**：
   - 磁盘空间使用率（超过85%会告警）
   - CPU负载（每核心负载超过1.5会告警）
   - 内存使用率（超过90%会告警）

## 设置步骤

### 1. 确保日志目录存在

首先，运行以下命令创建必要的日志目录：

```bash
./scripts/ensure_dirs.sh
```

该命令需要sudo权限来创建日志目录。

### 2. 配置飞书通知

在项目根目录的`.env`文件中添加以下配置（如果文件不存在，请创建它）：

```bash
# 通知Webhook URL
DEPLOY_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/your-webhook-token

# Qdrant服务配置
QDRANT_SERVICE_HOST=localhost
QDRANT_SERVICE_PORT=6333
QDRANT_SERVICE_API_KEY=your-qdrant-api-key  # 如果Qdrant启用了API密钥认证
```

请将`your-webhook-token`替换为您的飞书机器人实际webhook地址，并根据您的Qdrant配置修改相关参数。

### 3. 设置健康检查定时任务

运行以下命令设置健康检查定时任务：

```bash
make health-check-setup
```

这将添加一个crontab任务，每5分钟执行一次健康检查。

### 4. 确保服务有健康检查端点

- **main-server**: 已添加 `/api/health` 端点
- **ai-service**: 已添加 `/health` 端点

### 5. 验证设置

检查crontab是否正确设置：

```bash
crontab -l | grep health_check
```

应该能看到类似以下内容：
```bash
*/5 * * * * /path/to/your/project/scripts/health_check.sh >> /var/log/inner_bot_server/health_check_cron.log 2>&1
```

## 手动执行健康检查

如果需要手动执行健康检查，可以直接运行：

```bash
make health-check
```

或者：

```bash
./scripts/health_check.sh
```

## 日志查看

健康检查系统会生成以下日志文件：

1. **主日志**：`/var/log/inner_bot_server/health_check.log`
   - 包含每次健康检查的详细记录

2. **定时任务日志**：`/var/log/inner_bot_server/health_check_cron.log`
   - 包含cron任务的执行情况

## 警报机制

为了避免在持续故障期间发送过多通知，系统采用了智能警报机制：

1. 首次检测到故障时立即发送通知
2. 之后每5次检测到故障才发送一次通知
3. 当服务恢复正常后，下次故障会重新从第1步开始

## 警报内容

健康检查发现问题时，会发送包含以下信息的飞书通知：

1. 问题描述
2. 受影响的服务
3. 当前服务器信息
4. 问题发生时间
5. 连续警报计数

## 服务接入

如需添加新的服务健康检查，请编辑`scripts/health_check.sh`文件：

1. 添加服务到`SERVICES`数组：

```bash
declare -A SERVICES=(
  ["service-name"]="endpoint"
)
```

2. 对于特殊服务，可以编写专用的检查函数：

```bash
check_service_name() {
  # 实现特定的健康检查逻辑
}
```

3. 在`perform_health_check`函数的case语句中添加对应的处理：

```bash
case "$SERVICE" in
  "service-name")
    check_service_name
    ;;
esac
```

## 设置所有监控任务

可以使用以下命令同时设置自动部署和健康检查：

```bash
make monitoring-setup
```

这将一次性设置所有监控任务。

## 故障排除

如果健康检查脚本无法正常工作，请检查：

1. 必要的工具是否已安装：
   - curl
   - nc (netcat)
   - bc (用于计算CPU负载)

2. 环境变量是否正确配置：
   - 各服务的端口和地址配置
   - Elasticsearch凭据（如使用）

3. 网络连接是否正常：
   - 防火墙设置
   - 端口是否开放
