"""
工具管理器

负责管理和执行AI工具调用，与装饰器系统集成
"""

import asyncio
import json
import logging
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


class ToolManager:
    """工具管理器类"""

    def __init__(self):
        self._tools: Dict[str, Callable] = {}
        self._tool_schemas: List[Dict[str, Any]] = []
        self._tool_metadata: Dict[str, Dict[str, Any]] = {}

    def register_tool(
        self,
        name: str,
        func: Callable,
        schema: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        注册一个工具

        Args:
            name: 工具名称
            func: 工具函数
            schema: 工具的OpenAI函数调用schema
            metadata: 额外的元数据信息
        """
        self._tools[name] = func

        # 避免重复添加相同的schema
        if not any(
            s.get("function", {}).get("name") == name for s in self._tool_schemas
        ):
            self._tool_schemas.append(schema)

        # 存储元数据
        self._tool_metadata[name] = metadata or {}

        logger.info(f"已注册工具: {name}")

    def unregister_tool(self, name: str) -> bool:
        """
        注销一个工具

        Args:
            name: 工具名称

        Returns:
            是否成功注销
        """
        if name not in self._tools:
            logger.warning(f"工具 {name} 不存在，无法注销")
            return False

        # 移除工具函数
        del self._tools[name]

        # 移除schema
        self._tool_schemas = [
            s for s in self._tool_schemas if s.get("function", {}).get("name") != name
        ]

        # 移除元数据
        self._tool_metadata.pop(name, None)

        logger.info(f"已注销工具: {name}")
        return True

    def get_tools_schema(self) -> List[Dict[str, Any]]:
        """获取所有工具的schema"""
        return self._tool_schemas.copy()

    def get_available_functions(self) -> Dict[str, Callable]:
        """获取所有可用函数"""
        return self._tools.copy()

    def get_tool_metadata(self, name: str) -> Dict[str, Any]:
        """获取工具的元数据"""
        return self._tool_metadata.get(name, {})

    def list_tools(self) -> List[str]:
        """列出所有已注册的工具名称"""
        return list(self._tools.keys())

    def has_tool(self, name: str) -> bool:
        """检查是否存在指定的工具"""
        return name in self._tools

    async def execute_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Any:
        """
        执行指定的工具

        Args:
            tool_name: 工具名称
            arguments: 工具参数

        Returns:
            工具执行结果

        Raises:
            ValueError: 工具不存在时抛出
            Exception: 工具执行失败时抛出
        """
        if tool_name not in self._tools:
            available_tools = ", ".join(self.list_tools())
            raise ValueError(f"工具 {tool_name} 不存在。可用工具: {available_tools}")

        func = self._tools[tool_name]

        try:
            # 记录工具调用
            logger.info(f"执行工具: {tool_name}，参数: {arguments}")

            # 支持异步和同步函数
            if asyncio.iscoroutinefunction(func):
                result = await func(**arguments)
            else:
                result = func(**arguments)

            logger.info(f"工具 {tool_name} 执行成功")
            return result

        except Exception as e:
            logger.error(f"工具 {tool_name} 执行失败: {type(e).__name__}: {repr(e)}")
            raise

    def get_tool_info(self, tool_name: str) -> Optional[Dict[str, Any]]:
        """
        获取工具的详细信息

        Args:
            tool_name: 工具名称

        Returns:
            工具信息字典，包含schema和元数据
        """
        if tool_name not in self._tools:
            return None

        # 找到对应的schema
        schema = None
        for s in self._tool_schemas:
            if s.get("function", {}).get("name") == tool_name:
                schema = s
                break

        return {
            "name": tool_name,
            "schema": schema,
            "metadata": self._tool_metadata.get(tool_name, {}),
            "function": self._tools[tool_name],
        }

    def clear_all_tools(self) -> None:
        """清除所有工具"""
        count = len(self._tools)
        self._tools.clear()
        self._tool_schemas.clear()
        self._tool_metadata.clear()
        logger.info(f"已清除所有工具 ({count} 个)")


# 全局工具管理器实例
_tool_manager: Optional[ToolManager] = None


def get_tool_manager() -> ToolManager:
    """获取工具管理器实例"""
    global _tool_manager
    if _tool_manager is None:
        raise RuntimeError("工具管理器尚未初始化，请先调用 init_tool_manager")
    return _tool_manager


def init_tool_manager() -> ToolManager:
    """初始化工具管理器"""
    global _tool_manager
    if _tool_manager is not None:
        logger.warning("工具管理器已初始化，返回现有实例")
        return _tool_manager

    _tool_manager = ToolManager()
    logger.info("工具管理器已初始化")
    return _tool_manager
