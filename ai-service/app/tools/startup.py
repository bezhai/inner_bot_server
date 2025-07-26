"""
工具系统启动

负责在应用启动时初始化工具系统
"""

import logging

from .registry import init_tools

logger = logging.getLogger(__name__)


async def startup_tools() -> bool:
    """
    启动工具系统

    这个函数应该在应用启动时调用

    Returns:
        是否启动成功
    """
    logger.info("开始启动工具系统...")

    try:
        # 导入内置工具模块已经触发了装饰器注册
        # 现在初始化工具系统
        success = init_tools()

        if success:
            logger.info("工具系统启动成功")
            return True
        else:
            logger.error("工具系统启动失败")
            return False

    except Exception as e:
        logger.error(f"工具系统启动异常: {e}")
        return False


def get_startup_info() -> dict:
    """
    获取启动信息，用于调试

    Returns:
        启动状态信息
    """
    from .registry import get_tools_summary

    return get_tools_summary()
