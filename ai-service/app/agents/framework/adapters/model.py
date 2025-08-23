"""
模型适配层
统一不同模型提供商的接口，支持 OpenAI 和 Ollama
"""

import asyncio
import logging
from abc import ABC, abstractmethod
from collections.abc import AsyncGenerator
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel

from app.services.chat.model import ModelService
from app.types.chat import ChatStreamChunk

logger = logging.getLogger(__name__)


class ModelProvider(str, Enum):
    """模型提供商枚举"""
    OPENAI = "openai"
    OLLAMA = "ollama"


class ModelConfig(BaseModel):
    """模型配置"""
    model_id: str
    provider: ModelProvider
    temperature: float = 0.7
    max_tokens: Optional[int] = None
    top_p: Optional[float] = None
    frequency_penalty: Optional[float] = None
    presence_penalty: Optional[float] = None


class StreamChunk(BaseModel):
    """流式响应数据块"""
    content: Optional[str] = None
    tool_calls: Optional[list[dict[str, Any]]] = None
    finish_reason: Optional[str] = None
    usage: Optional[dict[str, Any]] = None


class BaseModelProvider(ABC):
    """模型提供商基类"""
    
    @abstractmethod
    async def chat_completion_stream(
        self,
        messages: list[dict[str, Any]],
        config: ModelConfig,
        tools: Optional[list[dict[str, Any]]] = None,
        **kwargs
    ) -> AsyncGenerator[StreamChunk, None]:
        """流式聊天完成"""
        pass


class OpenAIProvider(BaseModelProvider):
    """OpenAI 模型提供商"""
    
    async def chat_completion_stream(
        self,
        messages: list[dict[str, Any]],
        config: ModelConfig,
        tools: Optional[list[dict[str, Any]]] = None,
        **kwargs
    ) -> AsyncGenerator[StreamChunk, None]:
        """使用现有的 ModelService 进行流式调用"""
        try:
            async for chunk in ModelService.chat_completion_stream(
                model_id=config.model_id,
                messages=messages,
                temperature=config.temperature,
                tools=tools,
                max_tool_iterations=kwargs.get('max_tool_iterations', 10)
            ):
                # 转换为标准格式
                yield StreamChunk(
                    content=chunk.delta.content if chunk.delta else None,
                    tool_calls=chunk.delta.tool_calls if chunk.delta and hasattr(chunk.delta, 'tool_calls') else None,
                    finish_reason=chunk.finish_reason,
                    usage=chunk.usage.model_dump() if chunk.usage else None
                )
        except Exception as e:
            logger.error(f"OpenAI provider error: {e}")
            raise


class OllamaProvider(BaseModelProvider):
    """Ollama 模型提供商（预留实现）"""
    
    async def chat_completion_stream(
        self,
        messages: list[dict[str, Any]],
        config: ModelConfig,
        tools: Optional[list[dict[str, Any]]] = None,
        **kwargs
    ) -> AsyncGenerator[StreamChunk, None]:
        """Ollama 流式调用实现（待实现）"""
        # TODO: 实现 Ollama 调用逻辑
        raise NotImplementedError("Ollama provider not implemented yet")


class ModelAdapter:
    """模型适配器 - 直接复用原有的 ChatService 回退逻辑"""
    
    def __init__(self):
        self._providers: dict[ModelProvider, BaseModelProvider] = {
            ModelProvider.OPENAI: OpenAIProvider(),
            ModelProvider.OLLAMA: OllamaProvider(),
        }
    
    async def chat_completion_stream_with_fallback(
        self,
        messages: list[dict[str, Any]],
        configs: list[ModelConfig],
        tools: Optional[list[dict[str, Any]]] = None,
        yield_interval: float = 0.5,
        **kwargs
    ) -> AsyncGenerator[ChatStreamChunk, None]:
        """
        支持回退的流式聊天完成 - 复用原有的多模型回退逻辑
        """
        from app.services.chat.message import AIChatService, ContentFilterError
        from app.services.chat_service import ChatService
        
        if not configs:
            raise ValueError("At least one model config is required")
        
        # 转换为原有的模型配置格式
        model_configs = [
            {"id": config.model_id, "name": f"模型{i+1}"}
            for i, config in enumerate(configs)
        ]
        
        accumulated_content = ChatStreamChunk(content="", reason_content="")
        last_yield_time = asyncio.get_event_loop().time()
        
        for i, model_config in enumerate(model_configs):
            try:
                # 使用原有的 _stream_with_model 逻辑
                async for chunk in ChatService._stream_with_model(
                    messages=messages,
                    model_id=model_config["id"],
                    yield_interval=yield_interval,
                    accumulated=accumulated_content,
                    last_yield_time=last_yield_time,
                ):
                    yield chunk
                    last_yield_time = asyncio.get_event_loop().time()
                
                # 成功完成，直接返回
                return
                
            except ContentFilterError as e:
                if i < len(model_configs) - 1:
                    logger.warning(f"{model_config['name']}内容过滤，切换模型: {str(e)}")
                    await ChatService._handle_partial_response(messages, accumulated_content)
                    last_yield_time = asyncio.get_event_loop().time()
                else:
                    logger.error(f"所有模型都因内容过滤失败: {str(e)}")
                    yield ChatStreamChunk(content="赤尾有点不想讨论这个话题呢~")
                    return
                    
            except Exception as e:
                if i < len(model_configs) - 1:
                    logger.warning(f"{model_config['name']}失败，切换模型: {str(e)}")
                    await ChatService._handle_partial_response(messages, accumulated_content)
                    last_yield_time = asyncio.get_event_loop().time()
                else:
                    logger.error(f"所有模型都失败: {str(e)}")
                    raise


# 全局实例
_model_adapter = None


def get_model_adapter() -> ModelAdapter:
    """获取模型适配器单例"""
    global _model_adapter
    if _model_adapter is None:
        _model_adapter = ModelAdapter()
    return _model_adapter