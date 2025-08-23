"""
基础 Agent 层
提供可组合的 Agent 基类，支持 React 模式和流式输出
"""

import asyncio
import json
import logging
from abc import ABC, abstractmethod
from collections.abc import AsyncGenerator
from typing import Any, Dict, List, Optional

from pydantic import BaseModel

from ..adapters.model import ModelAdapter, ModelConfig, StreamChunk, get_model_adapter
from ..adapters.tool import ToolAdapter, ToolFilter, get_tool_adapter
from ..adapters.memory import MemoryAdapter, get_memory_adapter
from app.types.chat import ChatStreamChunk, ToolCallFeedbackResponse
from app.services.chat.tool_status import ToolStatusService

logger = logging.getLogger(__name__)


class AgentConfig(BaseModel):
    """Agent 配置"""
    name: str
    description: str = ""
    model_configs: List[ModelConfig]
    tool_filter: Optional[ToolFilter] = None
    max_iterations: int = 10
    temperature: float = 0.7
    enable_memory: bool = True


class AgentState(BaseModel):
    """Agent 状态"""
    current_iteration: int = 0
    messages: List[Dict[str, Any]] = []
    tool_results: Dict[str, Any] = {}
    memory_context: Dict[str, Any] = {}
    finished: bool = False
    error: Optional[str] = None


class BaseAgent(ABC):
    """基础 Agent 类"""
    
    def __init__(
        self,
        config: AgentConfig,
        model_adapter: Optional[ModelAdapter] = None,
        tool_adapter: Optional[ToolAdapter] = None,
        memory_adapter: Optional[MemoryAdapter] = None,
    ):
        self.config = config
        self.model_adapter = model_adapter or get_model_adapter()
        self.tool_adapter = tool_adapter or get_tool_adapter()
        self.memory_adapter = memory_adapter or get_memory_adapter()
        self.state = AgentState()
    
    @abstractmethod
    async def process_stream(
        self,
        input_message: str,
        context: Optional[Dict[str, Any]] = None
    ) -> AsyncGenerator[ChatStreamChunk, None]:
        """处理输入并返回流式响应"""
        pass
    
    async def _prepare_messages(
        self,
        input_message: str,
        context: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """准备消息列表"""
        messages = []
        
        # 添加系统提示词
        if self.config.description:
            messages.append({
                "role": "system",
                "content": self.config.description
            })
        
        # 从内存中获取上下文
        if self.config.enable_memory and context and context.get("message_id"):
            try:
                # 使用现有的 MessageContext 实现
                memory_messages = await self.memory_adapter.get_conversation_context(
                    context["message_id"],
                    lambda param: self.config.description
                )
                # 只取非系统消息，避免重复系统提示词
                for msg in memory_messages:
                    if msg.get("role") != "system":
                        messages.append(msg)
            except Exception as e:
                logger.warning(f"Failed to load memory context: {e}")
        
        # 添加当前输入
        messages.append({
            "role": "user",
            "content": input_message
        })
        
        self.state.messages = messages
        return messages
    
    async def _get_available_tools(self) -> Optional[List[Dict[str, Any]]]:
        """获取可用工具"""
        if self.config.tool_filter is None:
            return None
        
        try:
            tools_schema = self.tool_adapter.get_tools_schema(self.config.tool_filter)
            return tools_schema if tools_schema else None
        except Exception as e:
            logger.error(f"Failed to get tools schema: {e}")
            return None


class SimpleAgent(BaseAgent):
    """简单 Agent - 基本的 LLM 流式输出（不启用工具）"""
    
    async def process_stream(
        self,
        input_message: str,
        context: Optional[Dict[str, Any]] = None
    ) -> AsyncGenerator[ChatStreamChunk, None]:
        """简单的流式处理 - 使用原有的 AIChatService 但禁用工具"""
        try:
            # 准备消息
            messages = await self._prepare_messages(input_message, context)
            
            # 发送状态消息
            yield ChatStreamChunk(
                tool_call_feedback=ToolCallFeedbackResponse(
                    name="thinking",
                    status_message=ToolStatusService.get_default_status_message("thinking")
                )
            )
            
            # 使用原有的 AIChatService，但禁用工具
            from app.services.chat.message import AIChatService
            
            # 使用第一个模型配置
            model_id = self.config.model_configs[0].model_id
            temperature = self.config.model_configs[0].temperature
            
            async for chunk in AIChatService.stream_ai_reply(
                messages=messages,
                model_id=model_id,
                temperature=temperature,
                enable_tools=False,  # 简单 Agent 不启用工具
                max_tool_iterations=1,
            ):
                yield chunk
            
            self.state.finished = True
            
        except Exception as e:
            logger.error(f"SimpleAgent error: {e}")
            self.state.error = str(e)
            yield ChatStreamChunk(content=f"处理请求时出现错误: {str(e)}")


class ReactAgent(BaseAgent):
    """React Agent - 复用原有的 AIChatService 实现"""
    
    async def process_stream(
        self,
        input_message: str,
        context: Optional[Dict[str, Any]] = None
    ) -> AsyncGenerator[ChatStreamChunk, None]:
        """直接使用原有的 AIChatService.stream_ai_reply"""
        try:
            # 准备消息
            messages = await self._prepare_messages(input_message, context)
            
            # 发送初始状态
            yield ChatStreamChunk(
                tool_call_feedback=ToolCallFeedbackResponse(
                    name="thinking",
                    status_message=ToolStatusService.get_default_status_message("thinking")
                )
            )
            
            # 使用原有的 AIChatService，完全保持原有逻辑
            from app.services.chat.message import AIChatService
            
            # 使用第一个模型配置
            model_id = self.config.model_configs[0].model_id
            temperature = self.config.model_configs[0].temperature
            
            async for chunk in AIChatService.stream_ai_reply(
                messages=messages,
                model_id=model_id,
                temperature=temperature,
                enable_tools=self.config.tool_filter is not None,
                max_tool_iterations=self.config.max_iterations,
            ):
                yield chunk
            
            self.state.finished = True
            
        except Exception as e:
            logger.error(f"ReactAgent error: {e}")
            self.state.error = str(e)
            yield ChatStreamChunk(content=f"处理请求时出现错误: {str(e)}")


def create_agent(agent_type: str, config: AgentConfig) -> BaseAgent:
    """创建 Agent 实例的工厂函数"""
    if agent_type == "simple":
        return SimpleAgent(config)
    elif agent_type == "react":
        return ReactAgent(config)
    else:
        raise ValueError(f"Unknown agent type: {agent_type}")


# 预定义配置
def create_default_configs() -> Dict[str, AgentConfig]:
    """创建默认配置"""
    from ..adapters.model import ModelProvider
    
    # 默认模型配置
    default_models = [
        ModelConfig(
            model_id="302.ai/gpt-4.1",
            provider=ModelProvider.OPENAI,
            temperature=0.7
        ),
        ModelConfig(
            model_id="Moonshot/kimi-k2-0711-preview",
            provider=ModelProvider.OPENAI,
            temperature=0.7
        ),
    ]
    
    return {
        "simple": AgentConfig(
            name="简单助手",
            description="我是一个AI助手，可以帮助你解答问题。",
            model_configs=default_models,
            enable_memory=True
        ),
        "react": AgentConfig(
            name="智能助手",
            description="我是一个智能AI助手，可以使用各种工具来帮助你完成任务。",
            model_configs=default_models,
            tool_filter=ToolFilter(enabled_only=True),
            max_iterations=5,
            enable_memory=True
        ),
    }