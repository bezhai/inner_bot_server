"""
工具注册管理

负责初始化工具系统，注册装饰器收集的工具，以及系统清理
"""

import logging
from typing import List, Dict, Any

from .decorators import (
    get_pending_tools,
    get_instance_tools,
    set_initialized,
    is_initialized,
)
from .manager import get_tool_manager, init_tool_manager

logger = logging.getLogger(__name__)


def init_tools() -> bool:
    """
    初始化工具系统

    注册所有通过装饰器定义的工具，包括函数工具和实例工具

    Returns:
        是否初始化成功
    """
    try:
        if is_initialized():
            logger.info("工具系统已初始化，跳过")
            return True

        # 初始化工具管理器
        tool_manager = init_tool_manager()

        # 获取所有待注册的工具
        pending_tools = get_pending_tools()

        logger.info(f"开始注册 {len(pending_tools)} 个工具")

        # 注册函数工具（非类方法）
        function_tools_count = 0
        for tool_info in pending_tools:
            if not tool_info["is_method"] and tool_info["handler"] is not None:
                if tool_info.get("enabled", True):
                    tool_manager.register_tool(
                        name=tool_info["name"],
                        func=tool_info["handler"],
                        schema=tool_info["schema"],
                        metadata={
                            "is_async": tool_info["is_async"],
                            "func_name": tool_info["func_name"],
                            "source": "decorator",
                        },
                    )
                    function_tools_count += 1
                    logger.info(f"已注册函数工具: {tool_info['name']}")
                else:
                    logger.info(f"工具 {tool_info['name']} 已禁用，跳过注册")

        # 注册实例工具（类方法）
        instance_tools = get_instance_tools()
        instance_tools_count = 0
        for instance, tools in instance_tools.items():
            for tool_info in tools:
                if tool_info.get("enabled", True):
                    tool_manager.register_tool(
                        name=tool_info["name"],
                        func=tool_info["handler"],
                        schema=tool_info["schema"],
                        metadata={
                            "is_async": tool_info["is_async"],
                            "instance_class": instance.__class__.__name__,
                            "source": "decorator",
                        },
                    )
                    instance_tools_count += 1
                    logger.info(f"已注册实例工具: {tool_info['name']}")
                else:
                    logger.info(f"工具 {tool_info['name']} 已禁用，跳过注册")

        # 标记为已初始化
        set_initialized(True)

        total_tools = function_tools_count + instance_tools_count
        logger.info(
            f"工具系统初始化完成，共注册 {total_tools} 个工具 "
            f"(函数工具: {function_tools_count}, 实例工具: {instance_tools_count})"
        )

        return True

    except Exception as e:
        logger.error(f"初始化工具系统失败: {e}")
        return False


def clear_tools() -> bool:
    """
    清除工具系统

    清除所有已注册的工具并重置初始化状态

    Returns:
        是否清除成功
    """
    try:
        if not is_initialized():
            logger.info("工具系统尚未初始化，无需清除")
            return True

        # 清除工具管理器中的所有工具
        tool_manager = get_tool_manager()
        tool_manager.clear_all_tools()

        # 重置初始化状态
        set_initialized(False)

        logger.info("工具系统已清除")
        return True

    except Exception as e:
        logger.error(f"清除工具系统失败: {e}")
        return False


def reload_tools() -> bool:
    """
    重新加载工具系统

    清除现有工具并重新初始化

    Returns:
        是否重新加载成功
    """
    logger.info("开始重新加载工具系统")

    # 先清除
    if not clear_tools():
        return False

    # 再初始化
    if not init_tools():
        return False

    logger.info("工具系统重新加载完成")
    return True


def get_tools_summary() -> Dict[str, Any]:
    """
    获取工具系统状态摘要

    Returns:
        包含工具系统状态信息的字典
    """
    try:
        summary = {
            "initialized": is_initialized(),
            "pending_tools_count": len(get_pending_tools()),
            "instance_tools_count": sum(
                len(tools) for tools in get_instance_tools().values()
            ),
            "registered_tools_count": 0,
            "registered_tools": [],
        }

        if is_initialized():
            tool_manager = get_tool_manager()
            summary["registered_tools_count"] = len(tool_manager.list_tools())
            summary["registered_tools"] = tool_manager.list_tools()

        return summary

    except Exception as e:
        logger.error(f"获取工具系统摘要失败: {e}")
        return {"error": str(e)}


def list_pending_tools() -> List[Dict[str, Any]]:
    """
    列出所有待注册的工具

    Returns:
        待注册工具信息列表
    """
    pending_tools = get_pending_tools()

    result = []
    for tool in pending_tools:
        result.append(
            {
                "name": tool["name"],
                "func_name": tool["func_name"],
                "is_method": tool["is_method"],
                "is_async": tool["is_async"],
                "enabled": tool.get("enabled", True),
                "has_handler": tool["handler"] is not None,
            }
        )

    return result


def list_instance_tools() -> List[Dict[str, Any]]:
    """
    列出所有实例工具

    Returns:
        实例工具信息列表
    """
    instance_tools = get_instance_tools()

    result = []
    for instance, tools in instance_tools.items():
        for tool in tools:
            result.append(
                {
                    "name": tool["name"],
                    "instance_class": instance.__class__.__name__,
                    "is_async": tool["is_async"],
                    "enabled": tool.get("enabled", True),
                }
            )

    return result
