"""
工具装饰器

提供@tool装饰器用于自动注册工具函数，以及ToolProvider基类用于自动注册类方法
"""

import asyncio
import functools
import inspect
import logging
from collections.abc import Callable
from typing import Any
from weakref import WeakKeyDictionary

from .schema_generator import generate_tool_schema, validate_tool_function

logger = logging.getLogger(__name__)

# 存储待注册的工具
_pending_tools: list[dict[str, Any]] = []

# 标记是否已初始化
_initialized = False

# 存储实例和对应的工具，使用弱引用字典避免内存泄漏
_instance_tools = WeakKeyDictionary()


def tool(name: str | None = None, description: str | None = None, enabled: bool = True):
    """
    工具装饰器，用于注册AI工具函数

    Args:
        name: 工具名称，默认使用函数名
        description: 工具描述，默认从docstring提取
        enabled: 是否启用该工具

    用法:
        @tool()
        def my_function(param: str) -> str:
            '''函数描述

            Args:
                param: 参数描述

            Returns:
                返回值描述
            '''
            return f"处理: {param}"

        # 带参数的装饰器
        @tool(name="custom_name", description="自定义描述")
        def another_function():
            pass

        # 类方法
        class MyService(ToolProvider):
            @tool(description="类方法工具")
            def class_method(self, data: str) -> str:
                return f"处理: {data}"
    """

    def decorator(func: Callable) -> Callable:
        # 验证函数是否适合作为工具
        if not validate_tool_function(func):
            logger.warning(f"函数 {func.__name__} 不适合作为工具，跳过注册")
            return func

        # 获取函数签名，判断是否为类方法
        sig = inspect.signature(func)
        params = list(sig.parameters.values())
        is_method = params and params[0].name in ("self", "cls")
        is_async = asyncio.iscoroutinefunction(func)

        # 生成工具schema
        try:
            tool_schema = generate_tool_schema(func, name=name, description=description)
        except Exception as e:
            logger.error(f"为函数 {func.__name__} 生成schema失败: {e}")
            return func

        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            return func(*args, **kwargs)

        # 保存工具信息到装饰器属性
        wrapper.__tool_name__ = tool_schema["function"]["name"]
        wrapper.__tool_schema__ = tool_schema
        wrapper.__tool_enabled__ = enabled
        wrapper.__original_func__ = func
        wrapper.__is_method__ = is_method
        wrapper.__is_async__ = is_async

        # 如果是普通函数（非类方法），直接添加到待注册列表
        if not is_method:
            _pending_tools.append(
                {
                    "name": tool_schema["function"]["name"],
                    "schema": tool_schema,
                    "handler": func,
                    "enabled": enabled,
                    "is_method": False,
                    "is_async": is_async,
                    "func_name": func.__name__,
                }
            )
            logger.info(f"工具函数 {func.__name__} 已添加到待注册列表")
        else:
            # 如果是类方法，记录信息等待类实例化时处理
            _pending_tools.append(
                {
                    "name": tool_schema["function"]["name"],
                    "schema": tool_schema,
                    "handler": None,  # 暂时为空，实例化时设置
                    "enabled": enabled,
                    "is_method": True,
                    "is_async": is_async,
                    "func_name": func.__name__,
                    "original_func": func,
                }
            )
            logger.info(f"工具类方法 {func.__name__} 已添加到待注册列表")

        return wrapper

    return decorator


def _register_instance_tools(instance: Any) -> None:
    """注册实例的所有工具方法"""

    # 如果实例已经注册过，不需要重复注册
    if instance in _instance_tools:
        return

    # 记录实例的工具
    _instance_tools[instance] = []

    # 查找实例中所有带有工具属性的方法
    for name, method in inspect.getmembers(instance):
        if hasattr(method, "__tool_name__"):
            tool_name = method.__tool_name__
            tool_schema = method.__tool_schema__
            tool_enabled = method.__tool_enabled__
            original_func = method.__original_func__
            is_async = getattr(method, "__is_async__", False)

            if not tool_enabled:
                logger.info(f"工具 {tool_name} 已禁用，跳过注册")
                continue

            # 创建绑定了实例的处理函数
            bound_handler = functools.partial(original_func, instance)

            # 记录工具信息
            _instance_tools[instance].append(
                {
                    "name": tool_name,
                    "schema": tool_schema,
                    "handler": bound_handler,
                    "enabled": tool_enabled,
                    "is_async": is_async,
                }
            )

            # 如果工具管理器已初始化，直接注册
            if _initialized:
                try:
                    from .manager import get_tool_manager

                    tool_manager = get_tool_manager()
                    tool_manager.register_tool(tool_name, bound_handler, tool_schema)
                    logger.info(
                        f"类 {instance.__class__.__name__} 的工具 {tool_name} 已注册"
                    )
                except RuntimeError:
                    logger.warning(
                        f"工具管理器尚未初始化，工具 {tool_name} 将在初始化后注册"
                    )


def register_instance(instance: Any) -> Any:
    """
    手动注册实例的所有工具方法

    Args:
        instance: 要注册工具的实例

    Returns:
        原实例（支持链式调用）

    用法:
        service = register_instance(MyService())
    """
    _register_instance_tools(instance)
    return instance


class ToolProvider:
    """
    工具提供者基类

    继承此类的对象在实例化时会自动注册所有@tool装饰的方法

    用法:
        class MyService(ToolProvider):
            def __init__(self, config: str):
                self.config = config
                super().__init__()  # 必须调用，触发工具注册

            @tool(description="处理数据")
            def process_data(self, data: str) -> str:
                return f"用配置 {self.config} 处理: {data}"

        # 自动注册工具
        service = MyService("my_config")
    """

    def __new__(cls, *args, **kwargs):
        instance = super().__new__(cls)
        return instance

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # 初始化时自动注册工具
        _register_instance_tools(self)


def get_pending_tools() -> list[dict[str, Any]]:
    """获取所有待注册的工具"""
    return _pending_tools.copy()


def get_instance_tools() -> dict[Any, list[dict[str, Any]]]:
    """获取所有实例工具"""
    return dict(_instance_tools)


def set_initialized(initialized: bool = True) -> None:
    """设置初始化状态"""
    global _initialized
    _initialized = initialized


def is_initialized() -> bool:
    """检查是否已初始化"""
    return _initialized
