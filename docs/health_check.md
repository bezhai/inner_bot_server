# 健康检查系统

本文档介绍了Inner Bot Server项目的健康检查系统的设置和使用方法。

## 原理

健康检查系统通过定期检查各项服务的状态和可用性，监控系统的整体健康状况。一旦检测到问题，系统会自动发送飞书通知，及时提醒维护人员进行处理。

## 功能特点

1. 定时检查服务健康状态（每5分钟一次）
2. 多种检查方式：HTTP健康端点、TCP端口连通性、Docker容器状态
3. 智能报警机制，避免通知轰炸
4. 详细的日志记录
5. 飞书通知 - 问题自动报警

## 检查项目

健康检查系统会检查以下服务的状态：

| 服务名称 | 检查方式 | 检查点 |
|---------|---------|-------|
| main-server | HTTP | <http://localhost:3000/api/health> |
| ai-service | HTTP | <http://localhost:8000/health> |
| redis | TCP | localhost:6379 |
| mongo | TCP | localhost:27017 |
| postgres | TCP | localhost:5432 |
| elasticsearch | TCP | localhost:9200 |

此外，还会检查关键Docker容器的运行状态。

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
```

请将`your-webhook-token`替换为您的飞书机器人实际webhook地址。

### 3. 设置健康检查定时任务

运行以下命令设置健康检查定时任务：

```bash
make health-check-setup
```

这将添加一个crontab任务，每5分钟执行一次健康检查。

### 4. 验证设置

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

## 服务接入

如需添加新的服务健康检查，请编辑`scripts/health_check.sh`文件中的`SERVICES`数组：

```bash
declare -A SERVICES=(
  ["service-name"]="endpoint"
)
```

其中，endpoint可以是：

- HTTP健康检查端点（以`http://`或`https://`开头）
- TCP端口检查（格式为`host:port`）

## 设置所有监控任务

可以使用以下命令同时设置自动部署和健康检查：

```bash
make monitoring-setup
```

这将一次性设置所有监控任务。
