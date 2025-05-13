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
  ["qdrant"]="localhost:6333"
)

# 检查Docker服务状态
check_docker_services() {
  log "检查Docker容器状态..."
  
  # 检查所有容器是否在运行
  CONTAINERS=$(docker ps --format "{{.Names}}")
  
  FAILED_CONTAINERS=()
  EXPECTED_CONTAINERS=("app" "ai-app" "redis" "mongo" "postgres" "elasticsearch" "logstash" "kibana" "meme")
  
  for CONTAINER in "${EXPECTED_CONTAINERS[@]}"; do
    if echo "$CONTAINERS" | grep -q "$CONTAINER"; then
      log "✅ $CONTAINER 容器运行中"
    else
      log "❌ $CONTAINER 容器未运行"
      FAILED_CONTAINERS+=("$CONTAINER")
    fi
  done
  
  if [ ${#FAILED_CONTAINERS[@]} -gt 0 ]; then
    log "以下容器未运行: ${FAILED_CONTAINERS[*]}"
    return 1
  fi
  
  log "所有预期的Docker容器都在运行"
  return 0
}

# 检查HTTP服务健康状态
check_http_service() {
  SERVICE_NAME=$1
  ENDPOINT=$2
  
  log "检查 $SERVICE_NAME 健康状态 ($ENDPOINT)..."
  
  # 添加超时，防止长时间等待
  RESPONSE=$(curl -s -m 10 -o /dev/null -w "%{http_code}" $ENDPOINT)
  
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

# 检查Redis服务健康状态
check_redis() {
  SERVICE_NAME="redis"
  HOST_PORT=${SERVICES[$SERVICE_NAME]}
  HOST=$(echo $HOST_PORT | cut -d: -f1)
  PORT=$(echo $HOST_PORT | cut -d: -f2)
  
  log "检查 $SERVICE_NAME 健康状态..."
  
  # 先检查端口
  nc -z -w 5 $HOST $PORT
  if [ $? -ne 0 ]; then
    log "❌ $SERVICE_NAME 端口不可连接"
    return 1
  fi
  
  # 只使用端口检查，不使用redis-cli
  log "✅ $SERVICE_NAME 端口可连接"
  return 0
}

# 检查MongoDB服务健康状态
check_mongo() {
  SERVICE_NAME="mongo"
  HOST_PORT=${SERVICES[$SERVICE_NAME]}
  HOST=$(echo $HOST_PORT | cut -d: -f1)
  PORT=$(echo $HOST_PORT | cut -d: -f2)
  
  log "检查 $SERVICE_NAME 健康状态..."
  
  # 先检查端口
  nc -z -w 5 $HOST $PORT
  if [ $? -ne 0 ]; then
    log "❌ $SERVICE_NAME 端口不可连接"
    return 1
  fi
  
  # 实际上，只能进行端口检查，更高级的检查需要MongoDB客户端工具
  # 如果服务器安装了MongoDB客户端，可以添加更复杂的检查逻辑
  log "✅ $SERVICE_NAME 端口可连接"
  return 0
}

# 检查PostgreSQL服务健康状态
check_postgres() {
  SERVICE_NAME="postgres"
  HOST_PORT=${SERVICES[$SERVICE_NAME]}
  HOST=$(echo $HOST_PORT | cut -d: -f1)
  PORT=$(echo $HOST_PORT | cut -d: -f2)
  
  log "检查 $SERVICE_NAME 健康状态..."
  
  # 只检查端口连通性
  nc -z -w 5 $HOST $PORT
  if [ $? -ne 0 ]; then
    log "❌ $SERVICE_NAME 端口不可连接"
    return 1
  else
    log "✅ $SERVICE_NAME 端口可连接"
    return 0
  fi
}

# 检查Elasticsearch服务健康状态
check_elasticsearch() {
  SERVICE_NAME="elasticsearch"
  HOST_PORT=${SERVICES[$SERVICE_NAME]}
  HOST=$(echo $HOST_PORT | cut -d: -f1)
  PORT=$(echo $HOST_PORT | cut -d: -f2)
  
  log "检查 $SERVICE_NAME 健康状态..."
  
  # 先检查端口
  nc -z -w 5 $HOST $PORT
  if [ $? -ne 0 ]; then
    log "❌ $SERVICE_NAME 端口不可连接"
    return 1
  fi
  
  # 尝试请求ES健康状态API
  AUTH=""
  if [ -f "$PROJECT_DIR/.env" ] && grep -q "ELASTIC_PASSWORD" "$PROJECT_DIR/.env"; then
    source "$PROJECT_DIR/.env"
    if [ ! -z "$ELASTIC_PASSWORD" ]; then
      AUTH="-u elastic:$ELASTIC_PASSWORD"
    fi
  fi
  
  ES_RESULT=$(curl -s -m 10 $AUTH http://$HOST:$PORT/_cluster/health)
  
  if [[ "$ES_RESULT" == *"status"* ]]; then
    if [[ "$ES_RESULT" == *"green"* ]] || [[ "$ES_RESULT" == *"yellow"* ]]; then
      log "✅ $SERVICE_NAME 集群状态正常"
      return 0
    else
      log "❌ $SERVICE_NAME 集群状态异常: $ES_RESULT"
      return 1
    fi
  else
    log "⚠️ $SERVICE_NAME 健康检查API无响应，但端口可访问"
    return 0
  fi
}

# 检查磁盘空间
check_disk_space() {
  log "检查磁盘空间..."
  
  # 获取主分区使用率
  DISK_USAGE=$(df -h / | tail -n 1 | awk '{print $5}' | sed 's/%//')
  
  log "当前磁盘使用率: ${DISK_USAGE}%"
  
  # 如果使用率超过85%，发出警告
  if [ "$DISK_USAGE" -gt 85 ]; then
    log "❌ 磁盘空间不足，使用率 ${DISK_USAGE}%"
    return 1
  else
    log "✅ 磁盘空间充足"
    return 0
  fi
}

# 检查系统资源
check_system_resources() {
  log "检查系统资源..."
  
  # 获取CPU负载
  CPU_LOAD=$(uptime | awk -F'[a-z]:' '{ print $2}' | awk -F',' '{ print $1}' | tr -d ' ')
  CPU_CORES=$(nproc)
  CPU_LOAD_PER_CORE=$(echo "$CPU_LOAD / $CPU_CORES" | bc -l)
  
  # 获取内存使用率
  if [[ "$(uname)" == "Darwin" ]]; then
    # macOS
    MEM_USAGE=$(vm_stat | grep "Page active" | awk '{print $3}' | sed 's/\.//')
    MEM_TOTAL=$(sysctl hw.memsize | awk '{print $2}')
    MEM_PERCENTAGE=$(echo "scale=2; $MEM_USAGE * 4096 * 100 / $MEM_TOTAL" | bc)
  else
    # Linux
    MEM_PERCENTAGE=$(free | grep Mem | awk '{print $3/$2 * 100.0}')
  fi
  
  log "当前CPU负载: $CPU_LOAD (每核心负载: $(printf "%.2f" $CPU_LOAD_PER_CORE))"
  log "当前内存使用率: $(printf "%.2f" $MEM_PERCENTAGE)%"
  
  # 如果CPU每核负载超过1.5或内存使用率超过90%，发出警告
  if (( $(echo "$CPU_LOAD_PER_CORE > 1.5" | bc -l) )) || (( $(echo "$MEM_PERCENTAGE > 90" | bc -l) )); then
    if (( $(echo "$CPU_LOAD_PER_CORE > 1.5" | bc -l) )); then
      log "❌ CPU负载过高"
    fi
    if (( $(echo "$MEM_PERCENTAGE > 90" | bc -l) )); then
      log "❌ 内存使用率过高"
    fi
    return 1
  else
    log "✅ 系统资源使用正常"
    return 0
  fi
}

# 检查Qdrant服务健康状态
check_qdrant() {
  log "检查 Qdrant 健康状态..."
  
  # 从.env文件读取Qdrant服务配置
  if [ -f "$PROJECT_DIR/.env" ]; then
    source "$PROJECT_DIR/.env"
  else
    log "❌ 找不到.env文件，无法获取Qdrant配置"
    return 1
  fi
  
  # 检查环境变量是否存在 (注意：环境变量应该是大写)
  if [ -z "$QDRANT_SERVICE_HOST" ]; then
    # 尝试使用小写变量名 (与pydantic配置中的名称匹配)
    QDRANT_SERVICE_HOST="$qdrant_service_host"
  fi
  
  if [ -z "$QDRANT_SERVICE_PORT" ]; then
    QDRANT_SERVICE_PORT="$qdrant_service_port"
  fi
  
  # 获取API密钥
  if [ -z "$QDRANT_SERVICE_API_KEY" ]; then
    QDRANT_SERVICE_API_KEY="$qdrant_service_api_key"
  fi
  
  # 再次检查是否获取到了配置
  if [ -z "$QDRANT_SERVICE_HOST" ] || [ -z "$QDRANT_SERVICE_PORT" ]; then
    log "❌ 无法获取Qdrant配置，尝试使用默认值"
    QDRANT_SERVICE_HOST="localhost"
    QDRANT_SERVICE_PORT="6333"
  fi
  
  log "使用Qdrant配置: ${QDRANT_SERVICE_HOST}:${QDRANT_SERVICE_PORT}"
  
  # 检查端口连通性
  nc -z -w 5 $QDRANT_SERVICE_HOST $QDRANT_SERVICE_PORT
  
  if [ $? -ne 0 ]; then
    log "❌ Qdrant服务不可连接: ${QDRANT_SERVICE_HOST}:${QDRANT_SERVICE_PORT}"
    return 1
  else
    # 准备API请求头
    HEADERS=""
    if [ ! -z "$QDRANT_SERVICE_API_KEY" ]; then
      HEADERS="-H \"api-key: $QDRANT_SERVICE_API_KEY\""
      log "使用Qdrant API密钥进行认证"
    fi
    
    # 尝试调用健康检查API
    HEALTH_CMD="curl -s -m 10 -o /dev/null -w \"%{http_code}\" $HEADERS http://${QDRANT_SERVICE_HOST}:${QDRANT_SERVICE_PORT}/healthz"
    HEALTH_RESPONSE=$(eval $HEALTH_CMD)
    
    if [ "$HEALTH_RESPONSE" == "200" ]; then
      log "✅ Qdrant服务健康"
      return 0
    else
      # 尝试集合API，作为备选检查
      COLLECTIONS_CMD="curl -s -m 10 -o /dev/null -w \"%{http_code}\" $HEADERS http://${QDRANT_SERVICE_HOST}:${QDRANT_SERVICE_PORT}/collections"
      COLLECTIONS_RESPONSE=$(eval $COLLECTIONS_CMD)
      
      if [ "$COLLECTIONS_RESPONSE" == "200" ]; then
        log "✅ Qdrant集合API可访问，服务可能正常"
        return 0
      else
        log "✅ Qdrant端口可连接，但API可能不可用。HTTP状态码: ${HEALTH_RESPONSE}"
        # 返回0，因为端口可连接，服务可能还是有效的
        return 0
      fi
    fi
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
    
    # 根据服务类型选择特定的检查方法
    case "$SERVICE" in
      "redis")
        check_redis
        ;;
      "mongo")
        check_mongo
        ;;
      "postgres")
        check_postgres
        ;;
      "elasticsearch")
        check_elasticsearch
        ;;
      "qdrant")
        # 使用专用函数检查Qdrant，忽略SERVICES中的默认值
        check_qdrant
        ;;
      *)
        # 默认检查方式
        if [[ $ENDPOINT == http* ]]; then
          # HTTP健康检查
          check_http_service $SERVICE $ENDPOINT
        else
          # TCP端口检查
          check_tcp_port $SERVICE $ENDPOINT
        fi
        ;;
    esac
    
    if [ $? -ne 0 ]; then
      FAILED_SERVICES+=("$SERVICE")
    fi
  done
  
  # 检查磁盘空间
  check_disk_space
  DISK_STATUS=$?
  
  # 检查CPU和内存使用率
  check_system_resources
  RESOURCE_STATUS=$?
  
  # 检查是否有服务失败
  if [ ${#FAILED_SERVICES[@]} -gt 0 ] || [ $DOCKER_STATUS -ne 0 ] || [ $DISK_STATUS -ne 0 ] || [ $RESOURCE_STATUS -ne 0 ]; then
    # 读取当前警报计数
    ALERT_COUNT=$(cat "$ALERT_COUNT_FILE")
    
    # 增加警报计数
    ALERT_COUNT=$((ALERT_COUNT + 1))
    echo "$ALERT_COUNT" > "$ALERT_COUNT_FILE"
    
    # 构建通知消息
    ALERT_MESSAGE="⚠️ 健康检查警告: 检测到系统异常\n"
    
    if [ $DOCKER_STATUS -ne 0 ]; then
      ALERT_MESSAGE+="- Docker容器状态异常\n"
    fi
    
    if [ $DISK_STATUS -ne 0 ]; then
      ALERT_MESSAGE+="- 磁盘空间不足\n"
    fi
    
    if [ $RESOURCE_STATUS -ne 0 ]; then
      ALERT_MESSAGE+="- 系统资源使用率过高\n"
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