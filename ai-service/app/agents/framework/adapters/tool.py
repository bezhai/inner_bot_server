"""
工具适配层
增强现有工具系统，支持标签过滤和 MCP 导入
"""

import logging
from typing import Any, Optional, Set, List
from enum import Enum

from pydantic import BaseModel

from app.tools import get_tool_manager, tool
from app.tools.manager import ToolManager

logger = logging.getLogger(__name__)


class ToolTag(str, Enum):
    """工具标签枚举"""
    # 基础功能
    SEARCH = "search"
    ANALYSIS = "analysis"
    GENERATION = "generation"
    TRANSFORMATION = "transformation"
    
    # 领域相关
    BANGUMI = "bangumi"
    WEB = "web"
    FILE = "file"
    DATABASE = "database"
    
    # 特殊功能
    MEMORY = "memory"
    SYSTEM = "system"
    DEBUG = "debug"


def tagged_tool(
    tags: List[ToolTag], 
    name: str | None = None, 
    description: str | None = None, 
    enabled: bool = True
):
    """
    带标签的工具装饰器，扩展现有的 @tool 装饰器
    
    Args:
        tags: 工具标签列表
        name: 工具名称，默认使用函数名
        description: 工具描述，默认从docstring提取
        enabled: 是否启用该工具
    
    用法:
        @tagged_tool([ToolTag.BANGUMI, ToolTag.SEARCH])
        def search_anime(query: str) -> str:
            '''搜索动漫信息'''
            return f"搜索结果: {query}"
    """
    def decorator(func):
        # 先使用原有的 @tool 装饰器
        wrapped_func = tool(name=name, description=description, enabled=enabled)(func)
        
        # 添加标签信息到装饰器属性
        if hasattr(wrapped_func, '__tool_schema__'):
            # 在工具的 metadata 中添加标签信息
            if 'metadata' not in wrapped_func.__tool_schema__:
                wrapped_func.__tool_schema__['metadata'] = {}
            wrapped_func.__tool_schema__['metadata']['tags'] = [tag.value for tag in tags]
        
        # 为了向后兼容，也保存到函数属性
        wrapped_func.__tool_tags__ = tags
        
        return wrapped_func
    
    return decorator


class ToolInfo(BaseModel):
    """工具信息"""
    name: str
    description: str
    tags: Set[ToolTag] = set()
    schema: dict[str, Any]
    metadata: dict[str, Any] = {}
    enabled: bool = True


class ToolFilter(BaseModel):
    """工具过滤器"""
    include_tags: Optional[Set[ToolTag]] = None
    exclude_tags: Optional[Set[ToolTag]] = None
    enabled_only: bool = True
    name_pattern: Optional[str] = None


class MCPTool(BaseModel):
    """MCP 工具定义"""
    name: str
    description: str
    input_schema: dict[str, Any]
    handler: str  # MCP 服务器的处理器路径


class MCPAdapter:
    """MCP 适配器（预留实现）"""
    
    def __init__(self):
        self._mcp_tools: dict[str, MCPTool] = {}
    
    async def register_mcp_server(self, server_url: str, tools: list[MCPTool]) -> None:
        """注册 MCP 服务器工具"""
        # TODO: 实现 MCP 服务器注册逻辑
        for tool in tools:
            self._mcp_tools[tool.name] = tool
            logger.info(f"Registered MCP tool: {tool.name}")
    
    async def call_mcp_tool(self, tool_name: str, arguments: dict[str, Any]) -> Any:
        """调用 MCP 工具"""
        # TODO: 实现 MCP 工具调用逻辑
        if tool_name not in self._mcp_tools:
            raise ValueError(f"MCP tool not found: {tool_name}")
        
        tool = self._mcp_tools[tool_name]
        # 这里应该调用实际的 MCP 服务器
        raise NotImplementedError("MCP tool calling not implemented yet")


class ToolAdapter:
    """增强的工具适配器 - 基于现有工具系统"""
    
    def __init__(self, tool_manager: Optional[ToolManager] = None):
        self._tool_manager = tool_manager or get_tool_manager()
        self._tool_info_cache: dict[str, ToolInfo] = {}
        self._mcp_adapter = MCPAdapter()
        self._refresh_tool_info()
    
    def _refresh_tool_info(self) -> None:
        """刷新工具信息缓存"""
        self._tool_info_cache.clear()
        
        # 获取所有工具的 schema
        schemas = self._tool_manager.get_tools_schema()
        
        for schema in schemas:
            function_info = schema.get("function", {})
            tool_name = function_info.get("name", "")
            
            if not tool_name:
                continue
            
            # 获取工具元数据
            metadata = self._tool_manager.get_tool_metadata(tool_name)
            
            # 从 schema 的 metadata 中提取标签（优先）
            tags = set()
            schema_metadata = schema.get("metadata", {})
            if "tags" in schema_metadata:
                tags = {ToolTag(tag) for tag in schema_metadata["tags"] if tag in [t.value for t in ToolTag]}
            
            # 从工具管理器的 metadata 中提取标签（备选）
            if not tags and "tags" in metadata:
                tags = {ToolTag(tag) for tag in metadata["tags"] if tag in [t.value for t in ToolTag]}
            
            # 根据工具名称自动推断标签（最后选择）
            if not tags:
                tags.update(self._infer_tags_from_name(tool_name))
            
            tool_info = ToolInfo(
                name=tool_name,
                description=function_info.get("description", ""),
                tags=tags,
                schema=schema,
                metadata=metadata,
                enabled=metadata.get("enabled", True)
            )
            
            self._tool_info_cache[tool_name] = tool_info
    
    def _infer_tags_from_name(self, tool_name: str) -> Set[ToolTag]:
        """从工具名称推断标签"""
        tags = set()
        name_lower = tool_name.lower()
        
        # 基于名称模式推断标签
        if "search" in name_lower:
            tags.add(ToolTag.SEARCH)
        if "bangumi" in name_lower:
            tags.add(ToolTag.BANGUMI)
        if "web" in name_lower or "http" in name_lower:
            tags.add(ToolTag.WEB)
        if "file" in name_lower or "read" in name_lower or "write" in name_lower:
            tags.add(ToolTag.FILE)
        if "memory" in name_lower or "context" in name_lower:
            tags.add(ToolTag.MEMORY)
        if "generate" in name_lower or "create" in name_lower:
            tags.add(ToolTag.GENERATION)
        if "analyze" in name_lower or "analysis" in name_lower:
            tags.add(ToolTag.ANALYSIS)
        if "transform" in name_lower or "convert" in name_lower:
            tags.add(ToolTag.TRANSFORMATION)
        
        return tags
    
    def get_tool_info(self, tool_name: str) -> Optional[ToolInfo]:
        """获取工具信息"""
        return self._tool_info_cache.get(tool_name)
    
    def list_tools(self, tool_filter: Optional[ToolFilter] = None) -> list[ToolInfo]:
        """列出工具，支持过滤"""
        tools = list(self._tool_info_cache.values())
        
        if tool_filter is None:
            return tools
        
        filtered_tools = []
        
        for tool in tools:
            # 检查是否启用
            if tool_filter.enabled_only and not tool.enabled:
                continue
            
            # 检查包含标签
            if tool_filter.include_tags:
                if not tool.tags.intersection(tool_filter.include_tags):
                    continue
            
            # 检查排除标签
            if tool_filter.exclude_tags:
                if tool.tags.intersection(tool_filter.exclude_tags):
                    continue
            
            # 检查名称模式
            if tool_filter.name_pattern:
                if tool_filter.name_pattern.lower() not in tool.name.lower():
                    continue
            
            filtered_tools.append(tool)
        
        return filtered_tools
    
    def get_tools_schema(self, tool_filter: Optional[ToolFilter] = None) -> list[dict[str, Any]]:
        """获取工具 schema，支持过滤"""
        filtered_tools = self.list_tools(tool_filter)
        return [tool.schema for tool in filtered_tools]
    
    def get_available_functions(self, tool_filter: Optional[ToolFilter] = None) -> dict[str, Any]:
        """获取可用函数，支持过滤"""
        filtered_tools = self.list_tools(tool_filter)
        all_functions = self._tool_manager.get_available_functions()
        
        filtered_functions = {}
        for tool in filtered_tools:
            if tool.name in all_functions:
                filtered_functions[tool.name] = all_functions[tool.name]
        
        return filtered_functions
    
    async def execute_tool(self, tool_name: str, arguments: dict[str, Any]) -> Any:
        """执行工具"""
        # 检查是否是 MCP 工具
        if tool_name in self._mcp_adapter._mcp_tools:
            return await self._mcp_adapter.call_mcp_tool(tool_name, arguments)
        
        # 使用原有工具管理器执行
        return await self._tool_manager.execute_tool(tool_name, arguments)
    
    def add_tool_tag(self, tool_name: str, tag: ToolTag) -> bool:
        """为工具添加标签"""
        if tool_name not in self._tool_info_cache:
            return False
        
        self._tool_info_cache[tool_name].tags.add(tag)
        return True
    
    def remove_tool_tag(self, tool_name: str, tag: ToolTag) -> bool:
        """移除工具标签"""
        if tool_name not in self._tool_info_cache:
            return False
        
        self._tool_info_cache[tool_name].tags.discard(tag)
        return True
    
    def enable_tool(self, tool_name: str) -> bool:
        """启用工具"""
        if tool_name not in self._tool_info_cache:
            return False
        
        self._tool_info_cache[tool_name].enabled = True
        return True
    
    def disable_tool(self, tool_name: str) -> bool:
        """禁用工具"""
        if tool_name not in self._tool_info_cache:
            return False
        
        self._tool_info_cache[tool_name].enabled = False
        return True
    
    async def register_mcp_tools(self, server_url: str, tools: list[MCPTool]) -> None:
        """注册 MCP 工具"""
        await self._mcp_adapter.register_mcp_server(server_url, tools)
        
        # 将 MCP 工具添加到缓存中
        for tool in tools:
            schema = {
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.input_schema
                }
            }
            
            tool_info = ToolInfo(
                name=tool.name,
                description=tool.description,
                tags={ToolTag.SYSTEM},  # MCP 工具默认标记为系统工具
                schema=schema,
                metadata={"mcp": True, "handler": tool.handler},
                enabled=True
            )
            
            self._tool_info_cache[tool.name] = tool_info


# 全局实例
_tool_adapter = None


def get_tool_adapter() -> ToolAdapter:
    """获取工具适配器单例"""
    global _tool_adapter
    if _tool_adapter is None:
        _tool_adapter = ToolAdapter()
    return _tool_adapter