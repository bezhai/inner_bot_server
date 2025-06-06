"""
AI工具系统

提供装饰器方式的工具注册和管理功能，支持：
- 自动schema生成
- 类型安全的参数处理
- 异步/同步函数支持
- Pydantic模型集成
"""

from .decorators import tool, ToolProvider
from .manager import get_tool_manager, init_tool_manager
from .schema_generator import generate_tool_schema
from .registry import init_tools, clear_tools
from .startup import startup_tools

__all__ = [
    # 装饰器和基类
    "tool",
    "ToolProvider",
    # 管理器
    "get_tool_manager",
    "init_tool_manager",
    # 工具管理
    "init_tools",
    "clear_tools",
    "startup_tools",
    # 实用工具
    "generate_tool_schema",
]

__version__ = "1.0.0"
