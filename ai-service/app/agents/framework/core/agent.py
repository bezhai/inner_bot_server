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
from ..adapters.memory import MemoryAdapter, MemoryType, get_memory_adapter
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
    memory_types: List[MemoryType] = [MemoryType.SHORT_TERM, MemoryType.WORKING]


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
                # 这里需要一个 prompt_generator，暂时用简单的实现
                memory_messages = await self.memory_adapter.get_conversation_context(
                    context["message_id"],
                    lambda param: self.config.description
                )
                messages.extend(memory_messages)
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
    """简单 Agent - 基本的 LLM 流式输出"""
    
    async def process_stream(
        self,
        input_message: str,
        context: Optional[Dict[str, Any]] = None
    ) -> AsyncGenerator[ChatStreamChunk, None]:
        """简单的流式处理"""
        try:
            # 准备消息
            messages = await self._prepare_messages(input_message, context)
            
            # 获取工具（如果配置了）
            tools = await self._get_available_tools()
            
            # 发送状态消息
            yield ChatStreamChunk(
                tool_call_feedback=ToolCallFeedbackResponse(
                    name="thinking",
                    status_message=ToolStatusService.get_default_status_message("thinking")
                )
            )
            
            # 使用模型适配器进行流式生成
            async for chunk in self.model_adapter.chat_completion_stream_with_fallback(
                messages=messages,
                configs=self.config.model_configs,
                tools=tools
            ):
                if chunk.content:
                    yield ChatStreamChunk(content=chunk.content)
                
                if chunk.finish_reason and chunk.finish_reason != "tool_calls":
                    break
            
            self.state.finished = True
            
        except Exception as e:
            logger.error(f"SimpleAgent error: {e}")
            self.state.error = str(e)
            yield ChatStreamChunk(content=f"处理请求时出现错误: {str(e)}")


class ReactAgent(BaseAgent):
    """React Agent - 支持工具调用的推理-行动循环"""
    
    async def process_stream(
        self,
        input_message: str,
        context: Optional[Dict[str, Any]] = None
    ) -> AsyncGenerator[ChatStreamChunk, None]:
        """React 模式的流式处理"""
        try:
            # 准备消息
            messages = await self._prepare_messages(input_message, context)
            
            # 获取工具
            tools = await self._get_available_tools()
            
            # 发送初始状态
            yield ChatStreamChunk(
                tool_call_feedback=ToolCallFeedbackResponse(
                    name="thinking",
                    status_message=ToolStatusService.get_default_status_message("thinking")
                )
            )
            
            # React 循环
            for iteration in range(self.config.max_iterations):
                self.state.current_iteration = iteration
                
                logger.info(f"React iteration {iteration + 1}")
                
                # 使用模型生成响应
                tool_calls = []
                content_parts = []
                
                async for chunk in self.model_adapter.chat_completion_stream_with_fallback(
                    messages=messages,
                    configs=self.config.model_configs,
                    tools=tools
                ):
                    # 处理内容
                    if chunk.content:
                        content_parts.append(chunk.content)
                        yield ChatStreamChunk(content=chunk.content)
                    
                    # 处理工具调用
                    if chunk.tool_calls:
                        tool_calls.extend(chunk.tool_calls)
                    
                    # 检查是否完成
                    if chunk.finish_reason:
                        if chunk.finish_reason == "tool_calls":
                            break
                        elif chunk.finish_reason in ["stop", "length"]:
                            self.state.finished = True
                            return
                
                # 如果没有工具调用，结束循环
                if not tool_calls:
                    self.state.finished = True
                    return
                
                # 添加助手消息到历史
                if content_parts:
                    messages.append({
                        "role": "assistant",
                        "content": "".join(content_parts),
                        "tool_calls": tool_calls
                    })
                
                # 执行工具调用
                await self._execute_tool_calls(tool_calls, messages)
            
            # 如果达到最大迭代次数
            logger.warning(f"Reached max iterations ({self.config.max_iterations})")
            yield ChatStreamChunk(content="\n\n(已达到最大推理步数)")
            
        except Exception as e:
            logger.error(f"ReactAgent error: {e}")
            self.state.error = str(e)
            yield ChatStreamChunk(content=f"处理请求时出现错误: {str(e)}")
    
    async def _execute_tool_calls(
        self,
        tool_calls: List[Dict[str, Any]],
        messages: List[Dict[str, Any]]
    ) -> None:
        """执行工具调用"""
        for tool_call in tool_calls:
            try:
                # 提取工具调用信息
                if isinstance(tool_call, dict):
                    tool_name = tool_call.get("function", {}).get("name")
                    arguments_str = tool_call.get("function", {}).get("arguments", "{}")
                    tool_call_id = tool_call.get("id", "")
                else:
                    # 处理其他格式的工具调用
                    tool_name = getattr(tool_call, "function", {}).get("name")
                    arguments_str = getattr(tool_call, "function", {}).get("arguments", "{}")
                    tool_call_id = getattr(tool_call, "id", "")
                
                if not tool_name:
                    continue
                
                # 发送工具调用状态
                yield ChatStreamChunk(
                    tool_call_feedback=ToolCallFeedbackResponse(
                        name=tool_name,
                        status_message=ToolStatusService.get_tool_status_message(tool_name)
                    )
                )
                
                # 解析参数
                try:
                    arguments = json.loads(arguments_str)
                except json.JSONDecodeError:
                    arguments = {}
                
                # 执行工具
                result = await self.tool_adapter.execute_tool(tool_name, arguments)
                
                # 添加工具结果到消息历史
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call_id,
                    "name": tool_name,
                    "content": str(result)
                })
                
                # 保存工具结果到状态
                self.state.tool_results[tool_name] = result
                
            except Exception as e:
                logger.error(f"Tool execution error for {tool_name}: {e}")
                # 添加错误信息到消息历史
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call_id,
                    "name": tool_name,
                    "content": f"工具执行失败: {str(e)}"
                })


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