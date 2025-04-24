import asyncio
import os
import logging
from typing import Any
from app.event_system import init_event_system, get_event_system

# 设置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("events")


async def init_events():
    """初始化事件系统"""
    try:
        # 初始化事件系统
        event_system = init_event_system(
            service_name="ai-service",
            default_ttl=30.0,  # 30秒
        )
        
        # 启动事件系统
        await event_system.start()
        
        logger.info("事件系统已初始化")
        
        # 注册事件处理器
        register_event_handlers(event_system)
        
        return True
    except Exception as e:
        logger.error(f"初始化事件系统失败: {e}")
        return False
    

def register_event_handlers(event_system):
    """注册事件处理器"""
    
    # 新增：处理消息接收事件
    @event_system.subscribe("message_receive")
    async def handle_message_receive(message_data):
        logger.info(f"收到消息接收事件: {message_data}")
        
        # 返回默认值
        return {
            "status": "received",
            "message_id": message_data.get("id", "unknown"),
            "timestamp": asyncio.get_event_loop().time(),
            "default_response": "这是一个默认的响应"
        }
    
    logger.info("事件处理器注册完成")


async def publish_event(event_type: str, data: Any, **kwargs):
    """发布事件（广播模式）"""
    try:
        event_system = get_event_system()
        await event_system.publish(event_type, data, **kwargs)
        return True
    except Exception as e:
        logger.error(f"发布事件失败: {e}")
        return False


async def publish_event_and_wait(event_type: str, data: Any, **kwargs):
    """发布事件并等待结果（请求-响应模式）"""
    try:
        event_system = get_event_system()
        result = await event_system.publish_and_wait(event_type, data, **kwargs)
        return result
    except Exception as e:
        logger.error(f"发布事件并等待结果失败: {e}")
        raise 