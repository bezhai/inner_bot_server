"""
序列化相关装饰器
"""

import functools
from typing import AsyncGenerator
import logging
import json

logger = logging.getLogger(__name__)


def auto_json_serialize(func):
    """
    自动序列化装饰器
    将异步生成器中的 Pydantic 模型自动转换为 JSON 字符串
    """

    @functools.wraps(func)
    async def wrapper(*args, **kwargs) -> AsyncGenerator[str, None]:
        async for item in func(*args, **kwargs):
            try:
                # 检查是否是 Pydantic 模型
                if hasattr(item, "model_dump_json"):
                    yield item.model_dump_json()
                elif hasattr(item, "json"):  # 兼容 Pydantic v1
                    yield item.json()
                elif isinstance(item, dict):
                    yield json.dumps(item, ensure_ascii=False)
                else:
                    # 其他类型直接返回字符串
                    yield str(item)
            except Exception as e:
                logger.error(f"序列化失败: {e}, item: {item}")
                # 兜底处理
                yield str(item)

    return wrapper
