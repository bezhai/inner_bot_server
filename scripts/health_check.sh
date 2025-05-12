#!/bin/bash

# 健康检查脚本
# 用于定期检查各个服务的健康状态

# 日志文件路径
LOG_FILE="/var/log/inner_bot_server/health_check.log"
LOCK_FILE="/tmp/inner_bot_server_health_check.lock"
ALERT_COUNT_FILE="/tmp/inner_bot_server_alert_count"

# 确保日志目录存在
mkdir -p $(dirname $LOG_FILE)

# 记录日志函数
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> $LOG_FILE
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# 发送飞书通知
send_feishu_notification() {
  # 加载.env文件中的环境变量
  if [ -f "$PROJECT_DIR/.env" ]; then
    log "加载环境变量文件"
    source "$PROJECT_DIR/.env"
  fi
  
  # 检查webhook URL是否存在
  if [ -z "$DEPLOY_WEBHOOK_URL" ]; then
    log "警告: DEPLOY_WEBHOOK_URL 环境变量未设置，无法发送通知"
    return 1
  fi
  
  # 构建通知消息
  MESSAGE="$1"
  
  # 发送通知
  log "发送飞书通知: $MESSAGE"
  curl -s -X POST -H "Content-Type: application/json" \
    -d "{\"msg_type\":\"text\",\"content\":{\"text\":\"$MESSAGE\"}}" \
    "$DEPLOY_WEBHOOK_URL"
    
  if [ $? -eq 0 ]; then
    log "飞书通知发送成功"
  else
    log "飞书通知发送失败"
  fi
}

# 检查是否有健康检查任务正在运行
if [ -f "$LOCK_FILE" ]; then
  PID=$(cat $LOCK_FILE)
  if ps -p $PID > /dev/null; then
    log "已有健康检查任务正在运行 (PID: $PID)，跳过本次执行"
    exit 0
  else
    log "发现过期的锁文件，继续执行"
  fi
fi

# 创建锁文件
echo $$ > $LOCK_FILE

# 确保脚本退出时删除锁文件
trap "rm -f $LOCK_FILE; exit" INT TERM EXIT

# 获取脚本所在目录
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
# 获取项目根目录
PROJECT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"

# 进入项目目录
cd $PROJECT_DIR
log "进入项目目录: $PROJECT_DIR"

# 初始化警报计数器
if [ ! -f "$ALERT_COUNT_FILE" ]; then
  echo "0" > "$ALERT_COUNT_FILE"
fi

# 健康检查配置
declare -A SERVICES=(
  ["main-server"]="http://localhost:3000/api/health"
  ["ai-service"]="http://localhost:8000/health"
  ["redis"]="localhost:6379"
  ["mongo"]="localhost:27017"
  ["postgres"]="localhost:5432"
  ["elasticsearch"]="localhost:9200"
)

# 检查Docker服务状态
check_docker_services() {
  log "检查Docker容器状态..."
  
  # 检查所有容器是否在运行
  CONTAINERS=$(docker ps --format "{{.Names}}")
  
  # 检查main-server容器
  if echo "$CONTAINERS" | grep -q "app"; then
    log "✅ main-server 容器运行中"
  else
    log "❌ main-server 容器未运行"
    return 1
  fi

  # 检查ai-service容器
  if echo "$CONTAINERS" | grep -q "ai-app"; then
    log "✅ ai-service 容器运行中"
  else
    log "❌ ai-service 容器未运行"
    return 1
  fi

  # 检查redis容器
  if echo "$CONTAINERS" | grep -q "redis"; then
    log "✅ redis 容器运行中"
  else
    log "❌ redis 容器未运行"
    return 1
  fi

  # 检查其他核心服务...
  
  return 0
}

# 检查HTTP服务健康状态
check_http_service() {
  SERVICE_NAME=$1
  ENDPOINT=$2
  
  log "检查 $SERVICE_NAME 健康状态 ($ENDPOINT)..."
  
  RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" $ENDPOINT)
  
  if [ "$RESPONSE" == "200" ] || [ "$RESPONSE" == "204" ]; then
    log "✅ $SERVICE_NAME 服务健康"
    return 0
  else
    log "❌ $SERVICE_NAME 服务不健康 (HTTP状态码: $RESPONSE)"
    return 1
  fi
}

# 检查TCP端口是否可连接
check_tcp_port() {
  SERVICE_NAME=$1
  HOST_PORT=$2
  
  # 解析主机和端口
  HOST=$(echo $HOST_PORT | cut -d: -f1)
  PORT=$(echo $HOST_PORT | cut -d: -f2)
  
  log "检查 $SERVICE_NAME 端口连通性 ($HOST:$PORT)..."
  
  # 使用nc (netcat) 检查端口
  nc -z -w 5 $HOST $PORT
  
  if [ $? -eq 0 ]; then
    log "✅ $SERVICE_NAME 端口可连接"
    return 0
  else
    log "❌ $SERVICE_NAME 端口不可连接"
    return 1
  fi
}

# 执行健康检查
perform_health_check() {
  # 首先检查Docker服务状态
  check_docker_services
  DOCKER_STATUS=$?
  
  FAILED_SERVICES=()
  
  # 逐个检查服务健康状态
  for SERVICE in "${!SERVICES[@]}"; do
    ENDPOINT=${SERVICES[$SERVICE]}
    
    # 根据端点格式决定使用哪种检查方式
    if [[ $ENDPOINT == http* ]]; then
      # HTTP健康检查
      check_http_service $SERVICE $ENDPOINT
      if [ $? -ne 0 ]; then
        FAILED_SERVICES+=("$SERVICE")
      fi
    else
      # TCP端口检查
      check_tcp_port $SERVICE $ENDPOINT
      if [ $? -ne 0 ]; then
        FAILED_SERVICES+=("$SERVICE")
      fi
    fi
  done
  
  # 检查是否有服务失败
  if [ ${#FAILED_SERVICES[@]} -gt 0 ] || [ $DOCKER_STATUS -ne 0 ]; then
    # 读取当前警报计数
    ALERT_COUNT=$(cat "$ALERT_COUNT_FILE")
    
    # 增加警报计数
    ALERT_COUNT=$((ALERT_COUNT + 1))
    echo "$ALERT_COUNT" > "$ALERT_COUNT_FILE"
    
    # 构建通知消息
    ALERT_MESSAGE="⚠️ 健康检查警告: 检测到不健康的服务\n"
    
    if [ $DOCKER_STATUS -ne 0 ]; then
      ALERT_MESSAGE+="- Docker容器状态异常\n"
    fi
    
    for SERVICE in "${FAILED_SERVICES[@]}"; do
      ALERT_MESSAGE+="- $SERVICE 服务不健康\n"
    done
    
    # 添加服务器信息
    ALERT_MESSAGE+="\n服务器: $(hostname)\n"
    ALERT_MESSAGE+="时间: $(date)\n"
    ALERT_MESSAGE+="这是第 $ALERT_COUNT 次连续警报"
    
    # 根据警报次数决定是否发送通知（避免通知轰炸）
    if [ $ALERT_COUNT -eq 1 ] || [ $((ALERT_COUNT % 5)) -eq 0 ]; then
      send_feishu_notification "$ALERT_MESSAGE"
    else
      log "跳过本次警报通知（当前连续警报次数: $ALERT_COUNT）"
    fi
    
    return 1
  else
    # 所有服务健康，重置警报计数
    echo "0" > "$ALERT_COUNT_FILE"
    log "✅ 所有服务健康"
    
    return 0
  fi
}

# 开始健康检查
log "开始执行健康检查..."
perform_health_check

# 健康检查完成
log "健康检查完成"

# 删除锁文件
rm -f $LOCK_FILE 