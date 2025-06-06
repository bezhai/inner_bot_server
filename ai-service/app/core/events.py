import logging
from typing import Any
from app.core.event_system import init_event_system, get_event_system
from app.core.event_decorator import init_event_subscriptions

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

        # 初始化所有事件订阅
        init_event_subscriptions()

        return True
    except Exception as e:
        logger.error(f"初始化事件系统失败: {e}")
        return False


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
