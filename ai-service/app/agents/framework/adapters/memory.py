"""
内存适配层
直接复用现有的 MessageContext 实现，提供简单的包装
"""

import logging
from typing import Any, Dict, List, Callable
from collections.abc import Callable

from app.services.chat.context import MessageContext
from app.services.chat.prompt import PromptGeneratorParam

logger = logging.getLogger(__name__)


class MemoryAdapter:
    """内存适配器 - 直接使用现有的 MessageContext"""
    
    def __init__(self):
        self._contexts: Dict[str, MessageContext] = {}
    
    def get_or_create_context(
        self, 
        message_id: str, 
        prompt_generator: Callable[[PromptGeneratorParam], str]
    ) -> MessageContext:
        """获取或创建消息上下文"""
        if message_id not in self._contexts:
            self._contexts[message_id] = MessageContext(message_id, prompt_generator)
        return self._contexts[message_id]
    
    async def get_conversation_context(
        self, 
        message_id: str, 
        prompt_generator: Callable[[PromptGeneratorParam], str]
    ) -> List[Dict[str, Any]]:
        """获取对话上下文（直接使用现有实现）"""
        try:
            context = self.get_or_create_context(message_id, prompt_generator)
            await context.init_context_messages()
            return context.build(PromptGeneratorParam())
        except Exception as e:
            logger.error(f"Failed to get conversation context: {e}")
            return []


# 全局实例
_memory_adapter = None


def get_memory_adapter() -> MemoryAdapter:
    """获取内存适配器单例"""
    global _memory_adapter
    if _memory_adapter is None:
        _memory_adapter = MemoryAdapter()
    return _memory_adapter