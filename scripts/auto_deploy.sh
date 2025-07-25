#!/bin/bash

# 自动部署脚本
# 用于定时检查代码更新并执行部署

# 日志文件路径
LOG_FILE="/var/log/inner_bot_server/auto_deploy.log"
LOCK_FILE="/tmp/inner_bot_server_deploy.lock"

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
  HTTP_STATUS=$(curl -s -w "%{http_code}" -X POST -H "Content-Type: application/json" \
    -d "{\"msg_type\":\"text\",\"content\":{\"text\":\"$MESSAGE\"}}" \
    -o /dev/null "$DEPLOY_WEBHOOK_URL")
    
  if [ "$HTTP_STATUS" = "200" ]; then
    log "飞书通知发送成功 (HTTP $HTTP_STATUS)"
  else
    log "飞书通知发送失败 (HTTP $HTTP_STATUS)"
  fi
}

# 检查是否有部署任务正在运行
if [ -f "$LOCK_FILE" ]; then
  PID=$(cat $LOCK_FILE)
  if ps -p $PID > /dev/null; then
    log "已有部署任务正在运行 (PID: $PID)，跳过本次执行"
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

# 记录开始检查
log "开始检查代码更新"

# 拉取最新的远程分支信息但不合并
git fetch
if [ $? -ne 0 ]; then
  log "Git fetch 失败，请检查网络或仓库配置"
  rm -f $LOCK_FILE
  exit 1
fi

# 获取当前分支
BRANCH=$(git symbolic-ref --short HEAD)
log "当前分支: $BRANCH"

# 获取本地和远程的提交哈希
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse @{u})

# 如果本地和远程不一致，说明有更新
if [ "$LOCAL" != "$REMOTE" ]; then
  log "检测到代码更新，开始部署"
  
  # 记录当前版本
  OLD_VERSION=$(git rev-parse --short HEAD)
  
  # 记录变更内容
  CHANGES=$(git log --pretty=format:"%h - %s (%an, %ar)" $LOCAL..$REMOTE)
  log "即将应用以下变更:\n$CHANGES"
  
  # 执行git pull
  log "执行 git pull"
  git pull
  if [ $? -ne 0 ]; then
    log "Git pull 失败，中止部署"
    rm -f $LOCK_FILE
    exit 1
  fi
  
  # 记录新版本
  NEW_VERSION=$(git rev-parse --short HEAD)
  
  # 设置超时时间（秒）
  TIMEOUT=1800
  
  # 执行Makefile中的部署命令
  log "开始执行部署命令 (超时时间: ${TIMEOUT}秒)"
  timeout $TIMEOUT make deploy-live
  
  DEPLOY_STATUS=$?
  if [ $DEPLOY_STATUS -eq 124 ]; then
    log "部署超时（超过${TIMEOUT}秒），请手动检查服务状态"
    send_feishu_notification "⚠️ 部署超时警告：部署操作超过${TIMEOUT}秒，请检查服务状态。"
  elif [ $DEPLOY_STATUS -ne 0 ]; then
    log "部署失败，退出码: $DEPLOY_STATUS"
    send_feishu_notification "❌ 部署失败：从 $OLD_VERSION 更新到 $NEW_VERSION 失败，退出码: $DEPLOY_STATUS"
  else
    log "部署成功：从 $OLD_VERSION 更新到 $NEW_VERSION"
    # 发送部署成功的飞书通知
    NOTIFICATION_MESSAGE="✅ 服务已部署成功！\n从版本 $OLD_VERSION 更新到 $NEW_VERSION\n\n📝 变更内容:\n$CHANGES"
    send_feishu_notification "$NOTIFICATION_MESSAGE"
  fi
else
  log "没有检测到代码更新，跳过部署"
fi

# 删除锁文件
rm -f $LOCK_FILE
log "部署检查完成"
