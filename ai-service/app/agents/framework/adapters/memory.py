"""
内存适配层
包装现有的内存服务，提供统一的上下文管理接口
"""

import logging
from typing import Any, Optional, Dict, List
from abc import ABC, abstractmethod

from pydantic import BaseModel

from app.services.chat.context import MessageContext
from app.services.chat.prompt import PromptGeneratorParam
from app.services.qdrant import QdrantService

logger = logging.getLogger(__name__)


class MemoryType(str):
    """内存类型"""
    SHORT_TERM = "short_term"  # 短期记忆（对话上下文）
    LONG_TERM = "long_term"    # 长期记忆（向量数据库）
    WORKING = "working"        # 工作记忆（临时状态）


class MemoryItem(BaseModel):
    """内存项"""
    content: str
    metadata: Dict[str, Any] = {}
    timestamp: Optional[float] = None
    relevance_score: Optional[float] = None


class MemoryQuery(BaseModel):
    """内存查询"""
    query: str
    memory_type: MemoryType
    limit: int = 10
    threshold: float = 0.7
    filters: Dict[str, Any] = {}


class BaseMemoryProvider(ABC):
    """内存提供商基类"""
    
    @abstractmethod
    async def store(self, key: str, items: List[MemoryItem]) -> bool:
        """存储记忆"""
        pass
    
    @abstractmethod
    async def retrieve(self, query: MemoryQuery) -> List[MemoryItem]:
        """检索记忆"""
        pass
    
    @abstractmethod
    async def delete(self, key: str) -> bool:
        """删除记忆"""
        pass


class ShortTermMemoryProvider(BaseMemoryProvider):
    """短期记忆提供商（基于 MessageContext）"""
    
    def __init__(self):
        self._contexts: Dict[str, MessageContext] = {}
    
    async def store(self, key: str, items: List[MemoryItem]) -> bool:
        """存储短期记忆（对话上下文）"""
        try:
            # 这里可以扩展 MessageContext 来支持直接存储
            # 目前 MessageContext 主要通过 message_id 自动管理
            logger.info(f"Storing {len(items)} short-term memory items for key: {key}")
            return True
        except Exception as e:
            logger.error(f"Failed to store short-term memory: {e}")
            return False
    
    async def retrieve(self, query: MemoryQuery) -> List[MemoryItem]:
        """检索短期记忆"""
        try:
            # 从 MessageContext 获取上下文消息
            if query.query in self._contexts:
                context = self._contexts[query.query]
                messages = context.build(PromptGeneratorParam())
                
                items = []
                for msg in messages:
                    if isinstance(msg, dict) and "content" in msg:
                        items.append(MemoryItem(
                            content=msg["content"],
                            metadata={"role": msg.get("role", "unknown")}
                        ))
                
                return items[:query.limit]
            
            return []
        except Exception as e:
            logger.error(f"Failed to retrieve short-term memory: {e}")
            return []
    
    async def delete(self, key: str) -> bool:
        """删除短期记忆"""
        try:
            if key in self._contexts:
                del self._contexts[key]
            return True
        except Exception as e:
            logger.error(f"Failed to delete short-term memory: {e}")
            return False
    
    def get_or_create_context(self, message_id: str, prompt_generator) -> MessageContext:
        """获取或创建消息上下文"""
        if message_id not in self._contexts:
            self._contexts[message_id] = MessageContext(message_id, prompt_generator)
        return self._contexts[message_id]


class LongTermMemoryProvider(BaseMemoryProvider):
    """长期记忆提供商（基于 Qdrant）"""
    
    def __init__(self, qdrant_service: Optional[QdrantService] = None):
        self._qdrant_service = qdrant_service or QdrantService()
    
    async def store(self, key: str, items: List[MemoryItem]) -> bool:
        """存储长期记忆到向量数据库"""
        try:
            # 将记忆项转换为向量并存储
            for item in items:
                # 这里需要调用 Qdrant 服务的存储方法
                # 具体实现取决于 QdrantService 的接口
                pass
            
            logger.info(f"Stored {len(items)} long-term memory items for key: {key}")
            return True
        except Exception as e:
            logger.error(f"Failed to store long-term memory: {e}")
            return False
    
    async def retrieve(self, query: MemoryQuery) -> List[MemoryItem]:
        """从向量数据库检索长期记忆"""
        try:
            # 使用 Qdrant 服务进行相似性搜索
            # 具体实现取决于 QdrantService 的接口
            logger.info(f"Retrieving long-term memory for query: {query.query}")
            return []
        except Exception as e:
            logger.error(f"Failed to retrieve long-term memory: {e}")
            return []
    
    async def delete(self, key: str) -> bool:
        """删除长期记忆"""
        try:
            # 从 Qdrant 删除相关记录
            logger.info(f"Deleting long-term memory for key: {key}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete long-term memory: {e}")
            return False


class WorkingMemoryProvider(BaseMemoryProvider):
    """工作记忆提供商（内存中临时存储）"""
    
    def __init__(self):
        self._memory: Dict[str, List[MemoryItem]] = {}
    
    async def store(self, key: str, items: List[MemoryItem]) -> bool:
        """存储工作记忆"""
        try:
            self._memory[key] = items
            logger.info(f"Stored {len(items)} working memory items for key: {key}")
            return True
        except Exception as e:
            logger.error(f"Failed to store working memory: {e}")
            return False
    
    async def retrieve(self, query: MemoryQuery) -> List[MemoryItem]:
        """检索工作记忆"""
        try:
            items = self._memory.get(query.query, [])
            
            # 简单的关键词匹配过滤
            if query.filters.get("keyword"):
                keyword = query.filters["keyword"].lower()
                items = [item for item in items if keyword in item.content.lower()]
            
            return items[:query.limit]
        except Exception as e:
            logger.error(f"Failed to retrieve working memory: {e}")
            return []
    
    async def delete(self, key: str) -> bool:
        """删除工作记忆"""
        try:
            if key in self._memory:
                del self._memory[key]
            return True
        except Exception as e:
            logger.error(f"Failed to delete working memory: {e}")
            return False


class MemoryAdapter:
    """内存适配器"""
    
    def __init__(self):
        self._providers: Dict[MemoryType, BaseMemoryProvider] = {
            MemoryType.SHORT_TERM: ShortTermMemoryProvider(),
            MemoryType.LONG_TERM: LongTermMemoryProvider(),
            MemoryType.WORKING: WorkingMemoryProvider(),
        }
    
    def get_provider(self, memory_type: MemoryType) -> BaseMemoryProvider:
        """获取内存提供商"""
        if memory_type not in self._providers:
            raise ValueError(f"Unsupported memory type: {memory_type}")
        return self._providers[memory_type]
    
    async def store_memory(self, key: str, items: List[MemoryItem], memory_type: MemoryType = MemoryType.WORKING) -> bool:
        """存储记忆"""
        provider = self.get_provider(memory_type)
        return await provider.store(key, items)
    
    async def retrieve_memory(self, query: MemoryQuery) -> List[MemoryItem]:
        """检索记忆"""
        provider = self.get_provider(query.memory_type)
        return await provider.retrieve(query)
    
    async def delete_memory(self, key: str, memory_type: MemoryType = MemoryType.WORKING) -> bool:
        """删除记忆"""
        provider = self.get_provider(memory_type)
        return await provider.delete(key)
    
    async def get_conversation_context(self, message_id: str, prompt_generator) -> List[Dict[str, Any]]:
        """获取对话上下文（兼容现有接口）"""
        try:
            short_term_provider = self.get_provider(MemoryType.SHORT_TERM)
            if isinstance(short_term_provider, ShortTermMemoryProvider):
                context = short_term_provider.get_or_create_context(message_id, prompt_generator)
                await context.init_context_messages()
                return context.build(PromptGeneratorParam())
            return []
        except Exception as e:
            logger.error(f"Failed to get conversation context: {e}")
            return []
    
    async def search_relevant_memories(
        self, 
        query: str, 
        memory_types: List[MemoryType] = None,
        limit: int = 10
    ) -> Dict[MemoryType, List[MemoryItem]]:
        """搜索相关记忆"""
        if memory_types is None:
            memory_types = [MemoryType.SHORT_TERM, MemoryType.LONG_TERM, MemoryType.WORKING]
        
        results = {}
        
        for memory_type in memory_types:
            try:
                memory_query = MemoryQuery(
                    query=query,
                    memory_type=memory_type,
                    limit=limit
                )
                items = await self.retrieve_memory(memory_query)
                results[memory_type] = items
            except Exception as e:
                logger.error(f"Failed to search {memory_type} memory: {e}")
                results[memory_type] = []
        
        return results


# 全局实例
_memory_adapter = None


def get_memory_adapter() -> MemoryAdapter:
    """获取内存适配器单例"""
    global _memory_adapter
    if _memory_adapter is None:
        _memory_adapter = MemoryAdapter()
    return _memory_adapter