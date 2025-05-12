#!/bin/bash

# 确保自动部署所需的日志目录存在
# 这个脚本应该在设置自动部署前运行一次

# 日志目录
LOG_DIR="/var/log/inner_bot_server"

# 创建日志目录
sudo mkdir -p $LOG_DIR
sudo chown $(whoami) $LOG_DIR
sudo chmod 755 $LOG_DIR

echo "日志目录已创建: $LOG_DIR"
echo "您现在可以运行 'make auto-deploy-setup' 来设置自动部署" 