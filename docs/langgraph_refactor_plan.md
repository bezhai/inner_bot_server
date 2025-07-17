# AI-Service LLM 部分 LangGraph 重构实施方案

## 1. 项目概述

### 1.1 重构目标
- 将 ai-service 的 `/chat/sse` 接口的 LLM 处理部分重构为基于 LangGraph 的架构
- 保持现有接口的完全兼容性
- 提升系统的可扩展性和可维护性
- 为未来的复杂工作流和多步推理奠定基础

### 1.2 重构范围
**包含模块：**
- `app/services/chat_service.py` - 主要聊天服务层
- `app/services/chat/message.py` - AI聊天服务
- `app/services/chat/model.py` - 模型服务
- `app/services/chat/context.py` - 消息上下文管理
- `app/services/chat/prompt.py` - 提示词服务

**不包含模块：**
- 事件系统 (`app/core/event_system.py`)
- 分词工具 (`app/utils/split_word.py`)
- API路由层 (`app/api/chat.py`)
- 工具管理器 (`app/tools/manager.py`) - 保持现有实现

### 1.3 核心要求
1. **输出兼容性** - 保持现有的流式输出格式和特殊处理逻辑
2. **动态模型支持** - 支持运行时模型切换和配置
3. **提示词管理** - 使用 LangChain PromptTemplate 替代现有 Jinja2 实现
4. **外部记忆集成** - 保持与 Memory 服务的集成

## 2. 技术架构设计

### 2.1 依赖库选择
```python
# 新增依赖
langgraph>=0.0.40
langchain>=0.1.0
langchain-openai>=0.1.0
langchain-core>=0.1.0

# 现有依赖保留
openai>=1.0.0
pydantic>=2.0.0
asyncio
```

### 2.2 目录结构设计
```
app/services/chat/
├── __init__.py
├── chat_service.py          # 重构后的主服务
├── context.py               # 消息上下文管理 (保持)
├── langgraph/               # 新增：LangGraph 实现
│   ├── __init__.py
│   ├── graph.py             # 主图定义
│   ├── nodes.py             # 节点实现
│   ├── state.py             # 状态定义
│   ├── streaming.py         # 流式输出处理
│   └── models.py            # 模型管理
├── prompts/                 # 新增：提示词模板
│   ├── __init__.py
│   ├── templates.py         # LangChain 提示词模板
│   └── system_prompt.md     # 系统提示词文件
└── legacy/                  # 旧实现备份
    ├── message.py
    ├── model.py
    └── prompt.py
```

### 2.3 核心状态设计
```python
from typing import Dict, List, Any, Optional
from typing_extensions import TypedDict
from app.services.chat.context import MessageContext
from app.types.chat import ChatStreamChunk

class ChatGraphState(TypedDict):
    """LangGraph 聊天状态"""
    
    # 基础信息
    message_id: str
    context: MessageContext
    
    # 模型配置
    model_config: Dict[str, Any]  # {model_id, temperature, etc.}
    
    # 工作流参数
    workflow_params: Dict[str, Any]  # 未来扩展用
    
    # 提示词参数
    prompt_params: Dict[str, Any]
    generated_prompt: str
    
    # 流式输出控制
    streaming_config: Dict[str, Any]  # {yield_interval, buffer_size}
    
    # 输出状态
    accumulated_content: str
    accumulated_reason: str
    current_chunks: List[ChatStreamChunk]
    last_yield_time: float
    
    # 工具调用
    pending_tool_calls: List[Dict[str, Any]]
    tool_results: List[Dict[str, Any]]
    
    # 错误处理
    error_message: Optional[str]
    finish_reason: Optional[str]
```

## 3. 详细实施方案

### 3.1 阶段一：核心架构搭建（预计 3-4 天）

#### 3.1.1 状态定义 (`app/services/chat/langgraph/state.py`)

```python
from typing import Dict, List, Any, Optional
from typing_extensions import TypedDict
from app.services.chat.context import MessageContext
from app.types.chat import ChatStreamChunk

class ChatGraphState(TypedDict):
    # [状态定义如上所示]
    pass

# 状态操作辅助函数
def init_state(message_id: str, model_config: Dict[str, Any]) -> ChatGraphState:
    """初始化图状态"""
    return ChatGraphState(
        message_id=message_id,
        context=None,
        model_config=model_config,
        workflow_params={},
        prompt_params={},
        generated_prompt="",
        streaming_config={"yield_interval": 0.5, "buffer_size": 1024},
        accumulated_content="",
        accumulated_reason="",
        current_chunks=[],
        last_yield_time=0.0,
        pending_tool_calls=[],
        tool_results=[],
        error_message=None,
        finish_reason=None
    )
```

#### 3.1.2 节点实现 (`app/services/chat/langgraph/nodes.py`)

```python
import asyncio
import logging
from datetime import datetime
from typing import Dict, Any, AsyncGenerator

from langchain.prompts import PromptTemplate
from app.services.chat.context import MessageContext
from app.services.chat.langgraph.state import ChatGraphState
from app.services.chat.langgraph.models import LangGraphModelService
from app.services.meta_info import AsyncRedisClient
from app.types.chat import ChatStreamChunk

logger = logging.getLogger(__name__)

async def initialize_node(state: ChatGraphState) -> ChatGraphState:
    """初始化节点：加载上下文和设置基础参数"""
    
    # 加锁机制
    redis = AsyncRedisClient.get_instance()
    lock_key = f"msg_lock:{state['message_id']}"
    
    try:
        await redis.set(lock_key, "1", nx=True, ex=60)
        logger.info(f"消息锁定成功: {state['message_id']}")
    except Exception as e:
        logger.warning(f"消息加锁失败: {state['message_id']}, 错误: {str(e)}")
    
    # 初始化消息上下文
    from app.services.chat.prompts.templates import get_prompt_template
    
    prompt_template = get_prompt_template()
    context = MessageContext(state["message_id"], prompt_template.format)
    await context.init_context_messages()
    
    # 设置动态提示词参数
    prompt_params = {
        "current_time": datetime.now().strftime("%H:%M:%S"),
        "current_date": datetime.now().strftime("%Y-%m-%d"),
        **state.get("prompt_params", {})
    }
    
    return {
        **state,
        "context": context,
        "prompt_params": prompt_params,
        "last_yield_time": asyncio.get_event_loop().time()
    }

async def prompt_generation_node(state: ChatGraphState) -> ChatGraphState:
    """提示词生成节点"""
    
    from app.services.chat.prompts.templates import get_system_prompt_template
    
    template = get_system_prompt_template()
    generated_prompt = template.format(**state["prompt_params"])
    
    return {
        **state,
        "generated_prompt": generated_prompt
    }

async def model_call_node(state: ChatGraphState) -> ChatGraphState:
    """模型调用节点"""
    
    model_service = LangGraphModelService()
    
    # 构建消息
    messages = state["context"].build_with_prompt(state["generated_prompt"])
    
    # 准备工具
    tools = None
    if state["model_config"].get("enable_tools", False):
        from app.tools import get_tool_manager
        try:
            tool_manager = get_tool_manager()
            tools = tool_manager.get_tools_schema()
        except RuntimeError:
            logger.warning("工具系统未初始化")
    
    # 调用模型
    response_state = await model_service.stream_chat_completion(
        state=state,
        messages=messages,
        tools=tools
    )
    
    return response_state

async def tool_execution_node(state: ChatGraphState) -> ChatGraphState:
    """工具执行节点"""
    
    if not state["pending_tool_calls"]:
        return state
    
    from app.tools import get_tool_manager
    tool_manager = get_tool_manager()
    
    tool_results = []
    
    for tool_call in state["pending_tool_calls"]:
        try:
            result = await tool_manager.execute_tool(
                tool_call["function"]["name"],
                tool_call["function"]["arguments"]
            )
            
            tool_results.append({
                "tool_call_id": tool_call["id"],
                "role": "tool",
                "name": tool_call["function"]["name"],
                "content": str(result)
            })
            
        except Exception as e:
            logger.error(f"工具执行错误: {e}")
            tool_results.append({
                "tool_call_id": tool_call["id"],
                "role": "tool", 
                "name": tool_call["function"]["name"],
                "content": f"Error: {str(e)}"
            })
    
    # 将工具结果添加到上下文
    for result in tool_results:
        state["context"].append_message(result)
    
    return {
        **state,
        "tool_results": tool_results,
        "pending_tool_calls": []
    }

async def output_processing_node(state: ChatGraphState) -> ChatGraphState:
    """输出处理节点：处理特殊 finish_reason 和缓存逻辑"""
    
    # 处理特殊 finish_reason
    if state["finish_reason"] == "content_filter":
        special_chunk = ChatStreamChunk(content="赤尾有点不想讨论这个话题呢~")
        state["current_chunks"].append(special_chunk)
        state["accumulated_content"] += special_chunk.content
        
    elif state["finish_reason"] == "length":
        special_chunk = ChatStreamChunk(content="(后续内容被截断)")
        state["current_chunks"].append(special_chunk)
        state["accumulated_content"] += special_chunk.content
    
    return state

async def cleanup_node(state: ChatGraphState) -> ChatGraphState:
    """清理节点：释放资源"""
    
    # 解锁
    redis = AsyncRedisClient.get_instance()
    lock_key = f"msg_lock:{state['message_id']}"
    
    try:
        await redis.delete(lock_key)
        logger.info(f"消息解锁成功: {state['message_id']}")
    except Exception as e:
        logger.warning(f"消息解锁失败: {state['message_id']}, 错误: {str(e)}")
    
    return state
```

#### 3.1.3 流式输出处理 (`app/services/chat/langgraph/streaming.py`)

```python
import asyncio
import logging
from typing import AsyncGenerator

from app.services.chat.langgraph.state import ChatGraphState
from app.types.chat import ChatStreamChunk

logger = logging.getLogger(__name__)

class StreamingManager:
    """流式输出管理器"""
    
    def __init__(self, yield_interval: float = 0.5):
        self.yield_interval = yield_interval
        self.last_yield_time = 0.0
        self.accumulated_content = ""
        self.accumulated_reason = ""
        
    async def should_yield(self) -> bool:
        """检查是否应该输出"""
        current_time = asyncio.get_event_loop().time()
        return current_time - self.last_yield_time >= self.yield_interval
    
    async def yield_chunk(self, chunk: ChatStreamChunk) -> ChatStreamChunk:
        """输出数据块"""
        self.accumulated_content += chunk.content or ""
        self.accumulated_reason += chunk.reason_content or ""
        
        # 创建累积的chunk
        accumulated_chunk = ChatStreamChunk(
            content=self.accumulated_content,
            reason_content=self.accumulated_reason,
            tool_call_feedback=chunk.tool_call_feedback
        )
        
        self.last_yield_time = asyncio.get_event_loop().time()
        return accumulated_chunk
    
    async def process_streaming_response(
        self, 
        state: ChatGraphState, 
        chunk_generator: AsyncGenerator[ChatStreamChunk, None]
    ) -> AsyncGenerator[ChatStreamChunk, None]:
        """处理流式响应"""
        
        async for chunk in chunk_generator:
            # 累积内容
            self.accumulated_content += chunk.content or ""
            self.accumulated_reason += chunk.reason_content or ""
            
            # 检查是否应该输出
            if await self.should_yield():
                accumulated_chunk = await self.yield_chunk(chunk)
                yield accumulated_chunk
        
        # 输出最终内容
        if self.accumulated_content or self.accumulated_reason:
            final_chunk = ChatStreamChunk(
                content=self.accumulated_content,
                reason_content=self.accumulated_reason,
                tool_call_feedback=chunk.tool_call_feedback if 'chunk' in locals() else None
            )
            yield final_chunk
```

#### 3.1.4 模型服务适配 (`app/services/chat/langgraph/models.py`)

```python
import logging
from typing import Dict, List, Any, Optional, AsyncGenerator
from openai import AsyncOpenAI
from app.services.chat.langgraph.state import ChatGraphState
from app.services.chat.langgraph.streaming import StreamingManager
from app.orm.crud import get_model_and_provider_info
from app.types.chat import ChatStreamChunk

logger = logging.getLogger(__name__)

class LangGraphModelService:
    """LangGraph 模型服务"""
    
    def __init__(self):
        self.streaming_manager = StreamingManager()
        self._client_cache: Dict[str, AsyncOpenAI] = {}
    
    async def get_openai_client(self, model_id: str) -> AsyncOpenAI:
        """获取OpenAI客户端（复用现有逻辑）"""
        if model_id in self._client_cache:
            return self._client_cache[model_id]
        
        model_info = await get_model_and_provider_info(model_id)
        if model_info is None:
            raise Exception(f"Model {model_id} not found")
        
        client = AsyncOpenAI(
            api_key=model_info["api_key"],
            base_url=model_info["base_url"]
        )
        
        self._client_cache[model_id] = client
        return client
    
    async def stream_chat_completion(
        self,
        state: ChatGraphState,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None
    ) -> ChatGraphState:
        """流式聊天完成"""
        
        model_config = state["model_config"]
        client = await self.get_openai_client(model_config["model_id"])
        
        # 获取模型信息
        model_info = await get_model_and_provider_info(model_config["model_id"])
        model_name = model_info["model_name"]
        
        # 构建请求参数
        request_params = {
            "model": model_name,
            "messages": messages,
            "temperature": model_config.get("temperature", 0.7),
            "stream": True,
        }
        
        if tools:
            request_params["tools"] = tools
            request_params["tool_choice"] = "auto"
        
        # 发送请求
        stream = await client.chat.completions.create(**request_params)
        
        # 处理流式响应
        accumulated_content = ""
        tool_call_chunks = []
        has_tool_calls = False
        
        async for chunk in stream:
            if chunk.choices:
                choice = chunk.choices[0]
                delta = choice.delta
                
                # 处理内容
                if delta and delta.content:
                    content_chunk = delta.content
                    accumulated_content += content_chunk
                    
                    # 创建流式chunk
                    stream_chunk = ChatStreamChunk(content=content_chunk)
                    state["current_chunks"].append(stream_chunk)
                
                # 处理工具调用
                if delta and delta.tool_calls:
                    has_tool_calls = True
                    tool_call_chunks.extend(delta.tool_calls)
                
                # 检查完成状态
                if choice.finish_reason:
                    state["finish_reason"] = choice.finish_reason
                    break
        
        # 更新状态
        state["accumulated_content"] += accumulated_content
        
        # 处理工具调用
        if has_tool_calls:
            tool_calls = self._assemble_tool_calls(tool_call_chunks)
            state["pending_tool_calls"] = tool_calls
            
            # 添加助手消息到上下文
            assistant_message = {
                "role": "assistant",
                "content": accumulated_content if accumulated_content else None,
                "tool_calls": tool_calls
            }
            state["context"].append_message(assistant_message)
        
        return state
    
    def _assemble_tool_calls(self, tool_call_chunks: List[Any]) -> List[Dict[str, Any]]:
        """组装工具调用（复用现有逻辑）"""
        from collections import defaultdict
        
        tool_calls_dict = defaultdict(
            lambda: {
                "id": "",
                "type": "function", 
                "function": {"name": "", "arguments": ""}
            }
        )
        
        for chunk in tool_call_chunks:
            index = chunk.index
            tc = tool_calls_dict[index]
            
            if chunk.id:
                tc["id"] += chunk.id
            if chunk.function.name:
                tc["function"]["name"] += chunk.function.name
            if chunk.function.arguments:
                tc["function"]["arguments"] += chunk.function.arguments
        
        return list(tool_calls_dict.values())
```

#### 3.1.5 主图定义 (`app/services/chat/langgraph/graph.py`)

```python
import logging
from typing import Dict, Any, Literal
from langgraph.graph import StateGraph, END
from langgraph.graph.graph import CompiledGraph

from app.services.chat.langgraph.state import ChatGraphState, init_state
from app.services.chat.langgraph.nodes import (
    initialize_node,
    prompt_generation_node, 
    model_call_node,
    tool_execution_node,
    output_processing_node,
    cleanup_node
)

logger = logging.getLogger(__name__)

def should_continue_with_tools(state: ChatGraphState) -> Literal["tool_execution", "output_processing"]:
    """判断是否需要执行工具"""
    if state["pending_tool_calls"] and state["finish_reason"] == "tool_calls":
        return "tool_execution"
    return "output_processing"

def should_continue_after_tools(state: ChatGraphState) -> Literal["model_call", "output_processing"]:
    """工具执行后是否继续调用模型"""
    if state["tool_results"]:
        return "model_call"
    return "output_processing"

def create_chat_graph() -> CompiledGraph:
    """创建聊天处理图"""
    
    # 创建状态图
    graph = StateGraph(ChatGraphState)
    
    # 添加节点
    graph.add_node("initialize", initialize_node)
    graph.add_node("prompt_generation", prompt_generation_node)
    graph.add_node("model_call", model_call_node)
    graph.add_node("tool_execution", tool_execution_node)
    graph.add_node("output_processing", output_processing_node)
    graph.add_node("cleanup", cleanup_node)
    
    # 设置入口
    graph.set_entry_point("initialize")
    
    # 添加边
    graph.add_edge("initialize", "prompt_generation")
    graph.add_edge("prompt_generation", "model_call")
    
    # 条件边：模型调用后判断是否需要工具
    graph.add_conditional_edges(
        "model_call",
        should_continue_with_tools,
        {
            "tool_execution": "tool_execution",
            "output_processing": "output_processing"
        }
    )
    
    # 条件边：工具执行后判断是否继续
    graph.add_conditional_edges(
        "tool_execution", 
        should_continue_after_tools,
        {
            "model_call": "model_call",
            "output_processing": "output_processing"
        }
    )
    
    graph.add_edge("output_processing", "cleanup")
    graph.add_edge("cleanup", END)
    
    return graph.compile()

# 全局图实例
_chat_graph: CompiledGraph = None

def get_chat_graph() -> CompiledGraph:
    """获取聊天处理图实例"""
    global _chat_graph
    if _chat_graph is None:
        _chat_graph = create_chat_graph()
    return _chat_graph
```

### 3.2 阶段二：提示词模板重构（预计 1-2 天）

#### 3.2.1 提示词模板 (`app/services/chat/prompts/templates.py`)

```python
from pathlib import Path
from langchain.prompts import PromptTemplate
from langchain.prompts.chat import ChatPromptTemplate, SystemMessagePromptTemplate

# 提示词文件路径
PROMPT_DIR = Path(__file__).parent
SYSTEM_PROMPT_FILE = PROMPT_DIR / "system_prompt.md"

def get_system_prompt_template() -> PromptTemplate:
    """获取系统提示词模板"""
    
    if not SYSTEM_PROMPT_FILE.exists():
        # 降级到默认提示词
        default_template = """你是一个AI助手，当前时间是 {current_time}，当前日期是 {current_date}。
请根据以下对话历史回答用户问题。"""
        
        return PromptTemplate(
            template=default_template,
            input_variables=["current_time", "current_date"]
        )
    
    # 读取提示词文件
    prompt_content = SYSTEM_PROMPT_FILE.read_text(encoding="utf-8")
    
    # 创建模板
    return PromptTemplate.from_template(prompt_content)

def get_chat_prompt_template() -> ChatPromptTemplate:
    """获取聊天提示词模板"""
    
    system_template = get_system_prompt_template()
    
    return ChatPromptTemplate.from_messages([
        SystemMessagePromptTemplate(prompt=system_template)
    ])

def get_prompt_template():
    """获取提示词模板（兼容现有接口）"""
    return get_system_prompt_template()
```

#### 3.2.2 迁移现有提示词 (`app/services/chat/prompts/system_prompt.md`)

```markdown
# 将现有的 app/services/chat/prompt.md 内容迁移到这里
# 并适配 LangChain 的模板语法

你是一个AI助手，当前时间是 {current_time}，当前日期是 {current_date}。

# 在这里添加现有的提示词内容...
```

### 3.3 阶段三：服务层重构（预计 2-3 天）

#### 3.3.1 重构聊天服务 (`app/services/chat_service.py`)

```python
"""
重构后的聊天服务层
使用 LangGraph 处理 LLM 工作流
"""

import logging
import traceback
import asyncio
from datetime import datetime
from typing import AsyncGenerator

from app.types.chat import (
    ChatMessage,
    ChatRequest,
    ChatStreamChunk,
    Step,
    ChatProcessResponse,
    ChatNormalResponse,
)
from app.core.clients.memory_client import memory_client
from app.utils.decorators import auto_json_serialize
from app.services.chat.langgraph.graph import get_chat_graph
from app.services.chat.langgraph.state import init_state
from app.services.chat.langgraph.streaming import StreamingManager

logger = logging.getLogger(__name__)

class ChatService:
    """重构后的聊天服务类"""

    def __init__(self):
        self.graph = get_chat_graph()
        self.streaming_manager = StreamingManager()

    @staticmethod
    async def get_message_by_id(
        message_id: str, chat_id: str, user_id: str
    ) -> ChatMessage:
        """
        根据消息ID从Memory服务获取消息
        （保持现有实现不变）
        """
        # 保持现有实现
        pass

    async def generate_ai_reply(
        self,
        message_id: str,
        model_config: dict = None,
        yield_interval: float = 0.5,
    ) -> AsyncGenerator[ChatStreamChunk, None]:
        """
        使用 LangGraph 生成 AI 回复内容

        Args:
            message_id: 消息ID
            model_config: 模型配置
            yield_interval: 输出间隔时间

        Yields:
            ChatStreamChunk: AI 生成的回复内容片段
        """
        
        # 默认模型配置
        if model_config is None:
            model_config = {
                "model_id": "gpt-4.1",
                "temperature": 0.7,
                "enable_tools": True,
                "max_tool_iterations": 10
            }
        
        # 初始化状态
        initial_state = init_state(message_id, model_config)
        initial_state["streaming_config"]["yield_interval"] = yield_interval
        
        try:
            # 执行图工作流
            final_state = await self.graph.ainvoke(initial_state)
            
            # 处理流式输出
            async for chunk in self._process_graph_output(final_state):
                yield chunk
                
        except Exception as e:
            logger.error(f"LangGraph 执行失败: {str(e)}\n{traceback.format_exc()}")
            yield ChatStreamChunk(
                content=f"生成回复时出现错误: {str(e)}"
            )

    async def _process_graph_output(
        self, 
        state: dict
    ) -> AsyncGenerator[ChatStreamChunk, None]:
        """处理图输出为流式响应"""
        
        # 从状态中获取累积的chunks
        chunks = state.get("current_chunks", [])
        yield_interval = state.get("streaming_config", {}).get("yield_interval", 0.5)
        
        accumulated_content = ""
        accumulated_reason = ""
        last_yield_time = asyncio.get_event_loop().time()
        
        for chunk in chunks:
            # 累积内容
            if chunk.content:
                accumulated_content += chunk.content
            if chunk.reason_content:
                accumulated_reason += chunk.reason_content
            
            # 检查输出间隔
            current_time = asyncio.get_event_loop().time()
            if current_time - last_yield_time >= yield_interval:
                yield_chunk = ChatStreamChunk(
                    content=accumulated_content,
                    reason_content=accumulated_reason,
                    tool_call_feedback=chunk.tool_call_feedback
                )
                yield yield_chunk
                last_yield_time = current_time
        
        # 输出最终内容
        if accumulated_content or accumulated_reason:
            final_chunk = ChatStreamChunk(
                content=accumulated_content,
                reason_content=accumulated_reason,
                tool_call_feedback=chunks[-1].tool_call_feedback if chunks else None
            )
            yield final_chunk

    @auto_json_serialize
    async def process_chat_sse(
        self,
        request: ChatRequest,
        yield_interval: float = 0.5,
    ) -> AsyncGenerator[ChatNormalResponse | ChatProcessResponse, None]:
        """
        处理 SSE 聊天流程
        （保持接口兼容性）
        """
        try:
            # 1. 接收消息确认
            yield ChatNormalResponse(step=Step.ACCEPT)

            # 2. 开始生成回复
            yield ChatNormalResponse(step=Step.START_REPLY)

            # 3. 生成并发送回复
            last_content = ""
            async for chunk in self.generate_ai_reply(
                request.message_id, yield_interval=yield_interval
            ):
                last_content = chunk.content
                yield ChatProcessResponse(
                    step=Step.SEND,
                    content=chunk.content,
                    tool_call_feedback=chunk.tool_call_feedback,
                )

            # 4. 回复成功
            yield ChatProcessResponse(
                step=Step.SUCCESS,
                content=last_content,
            )

        except Exception as e:
            logger.error(f"SSE 聊天处理失败: {str(e)}\n{traceback.format_exc()}")
            yield ChatNormalResponse(step=Step.FAILED)
        finally:
            # 5. 流程结束
            yield ChatNormalResponse(step=Step.END)


# 创建服务实例
chat_service = ChatService()
```

#### 3.3.2 上下文管理器适配 (`app/services/chat/context.py`)

```python
# 为 MessageContext 添加支持 LangGraph 的方法

def build_with_prompt(self, system_prompt: str) -> List[Dict[str, Any]]:
    """构建带系统提示词的消息列表"""
    return [
        {"role": "system", "content": system_prompt},
        *list(
            map(
                lambda x: {
                    "role": x.role,
                    "content": (
                        f"[{x.user_name}]: {x.content}"
                        if x.role == "user"
                        else x.content
                    ),
                },
                self.context_messages,
            )
        ),
        *self.temp_messages,
    ]
```

### 3.4 阶段四：集成测试和验证（预计 2-3 天）

#### 3.4.1 单元测试 (`tests/test_langgraph_chat.py`)

```python
import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.chat.langgraph.state import ChatGraphState, init_state
from app.services.chat.langgraph.nodes import (
    initialize_node,
    prompt_generation_node,
    model_call_node,
    tool_execution_node,
)
from app.services.chat.langgraph.graph import get_chat_graph
from app.services.chat_service import ChatService
from app.types.chat import ChatRequest, ChatStreamChunk

class TestLangGraphChat:
    """LangGraph 聊天功能测试"""

    @pytest.fixture
    def mock_message_context(self):
        """模拟消息上下文"""
        context = MagicMock()
        context.init_context_messages = AsyncMock()
        context.build_with_prompt = MagicMock(return_value=[
            {"role": "system", "content": "你是AI助手"},
            {"role": "user", "content": "你好"}
        ])
        return context

    @pytest.fixture
    def sample_state(self):
        """示例状态"""
        return init_state("test_message_id", {
            "model_id": "gpt-4.1",
            "temperature": 0.7,
            "enable_tools": True
        })

    @pytest.mark.asyncio
    async def test_initialize_node(self, sample_state, mock_message_context):
        """测试初始化节点"""
        with patch('app.services.chat.langgraph.nodes.MessageContext', return_value=mock_message_context):
            with patch('app.services.meta_info.AsyncRedisClient.get_instance') as mock_redis:
                mock_redis.return_value.set = AsyncMock()
                
                result = await initialize_node(sample_state)
                
                assert result["context"] == mock_message_context
                assert "current_time" in result["prompt_params"]
                assert "current_date" in result["prompt_params"]

    @pytest.mark.asyncio
    async def test_prompt_generation_node(self, sample_state):
        """测试提示词生成节点"""
        sample_state["prompt_params"] = {
            "current_time": "12:00:00",
            "current_date": "2024-01-01"
        }
        
        with patch('app.services.chat.prompts.templates.get_system_prompt_template') as mock_template:
            mock_template.return_value.format.return_value = "Generated prompt"
            
            result = await prompt_generation_node(sample_state)
            
            assert result["generated_prompt"] == "Generated prompt"

    @pytest.mark.asyncio
    async def test_model_call_node(self, sample_state, mock_message_context):
        """测试模型调用节点"""
        sample_state["context"] = mock_message_context
        sample_state["generated_prompt"] = "Test prompt"
        
        with patch('app.services.chat.langgraph.nodes.LangGraphModelService') as mock_service:
            mock_service.return_value.stream_chat_completion = AsyncMock(
                return_value=sample_state
            )
            
            result = await model_call_node(sample_state)
            
            assert result == sample_state

    @pytest.mark.asyncio
    async def test_tool_execution_node(self, sample_state):
        """测试工具执行节点"""
        sample_state["pending_tool_calls"] = [
            {
                "id": "test_id",
                "function": {"name": "calculate", "arguments": '{"expression": "1+1"}'}
            }
        ]
        
        with patch('app.tools.get_tool_manager') as mock_manager:
            mock_manager.return_value.execute_tool = AsyncMock(return_value="2")
            
            result = await tool_execution_node(sample_state)
            
            assert len(result["tool_results"]) == 1
            assert result["tool_results"][0]["content"] == "2"
            assert result["pending_tool_calls"] == []

    @pytest.mark.asyncio
    async def test_chat_service_generate_ai_reply(self):
        """测试聊天服务生成回复"""
        service = ChatService()
        
        with patch.object(service.graph, 'ainvoke') as mock_invoke:
            mock_invoke.return_value = {
                "current_chunks": [
                    ChatStreamChunk(content="Hello"),
                    ChatStreamChunk(content=" world")
                ],
                "streaming_config": {"yield_interval": 0.5}
            }
            
            chunks = []
            async for chunk in service.generate_ai_reply("test_message_id"):
                chunks.append(chunk)
            
            assert len(chunks) > 0
            assert chunks[-1].content == "Hello world"

    @pytest.mark.asyncio
    async def test_chat_service_process_chat_sse(self):
        """测试SSE聊天流程"""
        service = ChatService()
        request = ChatRequest(message_id="test_message_id")
        
        with patch.object(service, 'generate_ai_reply') as mock_generate:
            mock_generate.return_value = AsyncMock()
            mock_generate.return_value.__aiter__.return_value = [
                ChatStreamChunk(content="Test response")
            ]
            
            responses = []
            async for response in service.process_chat_sse(request):
                responses.append(response)
            
            # 验证响应流程
            assert len(responses) >= 4  # ACCEPT, START_REPLY, SEND, SUCCESS, END
            assert responses[0].step == "ACCEPT"
            assert responses[-1].step == "END"
```

#### 3.4.2 集成测试 (`tests/test_langgraph_integration.py`)

```python
import pytest
import asyncio
from unittest.mock import AsyncMock, patch

from app.services.chat_service import ChatService
from app.types.chat import ChatRequest, Step

class TestLangGraphIntegration:
    """LangGraph 集成测试"""

    @pytest.mark.asyncio
    async def test_full_chat_flow(self):
        """测试完整的聊天流程"""
        service = ChatService()
        request = ChatRequest(message_id="integration_test_message")
        
        # Mock 各个依赖
        with patch('app.core.clients.memory_client.memory_client.quick_search') as mock_search:
            mock_search.return_value = [
                {"message_id": "prev_msg", "role": "user", "content": "Previous message"}
            ]
            
            with patch('app.orm.crud.get_model_and_provider_info') as mock_model_info:
                mock_model_info.return_value = {
                    "model_name": "gpt-4",
                    "api_key": "test_key",
                    "base_url": "https://api.openai.com/v1"
                }
                
                with patch('openai.AsyncOpenAI') as mock_openai:
                    # Mock OpenAI 流式响应
                    mock_stream = AsyncMock()
                    mock_stream.__aiter__.return_value = [
                        create_mock_chunk("Hello"),
                        create_mock_chunk(" world", finish_reason="stop")
                    ]
                    
                    mock_openai.return_value.chat.completions.create.return_value = mock_stream
                    
                    # 执行测试
                    responses = []
                    async for response in service.process_chat_sse(request):
                        responses.append(response)
                    
                    # 验证结果
                    assert len(responses) >= 4
                    assert responses[0].step == Step.ACCEPT
                    assert responses[-1].step == Step.END
                    
                    # 验证内容响应
                    content_responses = [r for r in responses if r.step == Step.SEND]
                    assert len(content_responses) > 0
                    assert "Hello world" in content_responses[-1].content

    @pytest.mark.asyncio
    async def test_tool_calling_flow(self):
        """测试工具调用流程"""
        service = ChatService()
        request = ChatRequest(message_id="tool_test_message")
        
        # Mock 工具管理器
        with patch('app.tools.get_tool_manager') as mock_tool_manager:
            mock_tool_manager.return_value.get_tools_schema.return_value = [
                {"type": "function", "function": {"name": "calculate"}}
            ]
            mock_tool_manager.return_value.execute_tool.return_value = "42"
            
            # Mock 其他依赖
            with self._mock_dependencies():
                with patch('openai.AsyncOpenAI') as mock_openai:
                    # Mock 工具调用响应
                    mock_stream = AsyncMock()
                    mock_stream.__aiter__.return_value = [
                        create_mock_tool_call_chunk(),
                        create_mock_chunk("The answer is 42", finish_reason="stop")
                    ]
                    
                    mock_openai.return_value.chat.completions.create.return_value = mock_stream
                    
                    # 执行测试
                    responses = []
                    async for response in service.process_chat_sse(request):
                        responses.append(response)
                    
                    # 验证工具调用
                    mock_tool_manager.return_value.execute_tool.assert_called_once()
                    
                    # 验证最终响应
                    content_responses = [r for r in responses if r.step == Step.SEND]
                    assert "42" in content_responses[-1].content

    def _mock_dependencies(self):
        """Mock 通用依赖"""
        return patch.multiple(
            'app.core.clients.memory_client.memory_client',
            quick_search=AsyncMock(return_value=[]),
        ), patch(
            'app.orm.crud.get_model_and_provider_info',
            return_value={
                "model_name": "gpt-4",
                "api_key": "test_key", 
                "base_url": "https://api.openai.com/v1"
            }
        )

def create_mock_chunk(content: str, finish_reason: str = None):
    """创建mock的OpenAI chunk"""
    chunk = MagicMock()
    chunk.choices = [MagicMock()]
    chunk.choices[0].delta.content = content
    chunk.choices[0].finish_reason = finish_reason
    return chunk

def create_mock_tool_call_chunk():
    """创建mock的工具调用chunk"""
    chunk = MagicMock()
    chunk.choices = [MagicMock()]
    chunk.choices[0].delta.tool_calls = [MagicMock()]
    chunk.choices[0].delta.tool_calls[0].function.name = "calculate"
    chunk.choices[0].delta.tool_calls[0].function.arguments = '{"expression": "40+2"}'
    chunk.choices[0].finish_reason = "tool_calls"
    return chunk
```

#### 3.4.3 性能测试 (`tests/test_langgraph_performance.py`)

```python
import pytest
import asyncio
import time
from unittest.mock import AsyncMock, patch

from app.services.chat_service import ChatService
from app.types.chat import ChatRequest

class TestLangGraphPerformance:
    """LangGraph 性能测试"""

    @pytest.mark.asyncio
    async def test_response_time(self):
        """测试响应时间"""
        service = ChatService()
        request = ChatRequest(message_id="perf_test_message")
        
        with self._mock_fast_dependencies():
            start_time = time.time()
            
            responses = []
            async for response in service.process_chat_sse(request):
                responses.append(response)
            
            end_time = time.time()
            response_time = end_time - start_time
            
            # 验证响应时间在合理范围内 (< 5秒)
            assert response_time < 5.0, f"Response time too slow: {response_time}s"
            
            # 验证响应完整性
            assert len(responses) >= 4

    @pytest.mark.asyncio
    async def test_concurrent_requests(self):
        """测试并发请求处理"""
        service = ChatService()
        
        # 创建多个并发请求
        requests = [
            ChatRequest(message_id=f"concurrent_test_{i}")
            for i in range(5)
        ]
        
        with self._mock_fast_dependencies():
            start_time = time.time()
            
            # 并发执行
            tasks = [
                self._process_single_request(service, req)
                for req in requests
            ]
            
            results = await asyncio.gather(*tasks)
            
            end_time = time.time()
            total_time = end_time - start_time
            
            # 验证并发处理效率
            assert total_time < 10.0, f"Concurrent processing too slow: {total_time}s"
            
            # 验证所有请求都成功处理
            assert len(results) == 5
            for result in results:
                assert len(result) >= 4

    async def _process_single_request(self, service: ChatService, request: ChatRequest):
        """处理单个请求"""
        responses = []
        async for response in service.process_chat_sse(request):
            responses.append(response)
        return responses

    def _mock_fast_dependencies(self):
        """Mock 快速响应的依赖"""
        return patch.multiple(
            'app.core.clients.memory_client.memory_client',
            quick_search=AsyncMock(return_value=[]),
        ), patch(
            'app.orm.crud.get_model_and_provider_info',
            return_value={
                "model_name": "gpt-4",
                "api_key": "test_key",
                "base_url": "https://api.openai.com/v1"
            }
        ), patch(
            'openai.AsyncOpenAI'
        ) as mock_openai:
            mock_stream = AsyncMock()
            mock_stream.__aiter__.return_value = [
                create_mock_chunk("Fast response", finish_reason="stop")
            ]
            mock_openai.return_value.chat.completions.create.return_value = mock_stream
```

## 4. 迁移策略

### 4.1 渐进式迁移方案

#### 4.1.1 第一阶段：双栈运行
- 保留现有实现作为备用
- 新增 LangGraph 实现
- 通过配置开关控制使用哪个实现

```python
# 在 app/config/config.py 中添加
class AppConfig(BaseSettings):
    # ... 现有配置
    
    # LangGraph 配置
    enable_langgraph: bool = Field(default=False, description="启用LangGraph实现")
    langgraph_fallback: bool = Field(default=True, description="LangGraph失败时回退到原实现")
```

#### 4.1.2 第二阶段：灰度发布
- 基于用户ID或消息ID进行灰度
- 监控两个实现的性能差异
- 收集用户反馈

```python
def should_use_langgraph(message_id: str) -> bool:
    """基于消息ID决定是否使用LangGraph"""
    hash_value = hash(message_id) % 100
    return hash_value < 10  # 10% 流量使用LangGraph
```

#### 4.1.3 第三阶段：全量切换
- 全量切换到 LangGraph 实现
- 移除旧实现代码
- 清理相关配置

### 4.2 数据迁移

#### 4.2.1 提示词迁移
```python
# 迁移脚本: scripts/migrate_prompts.py
import os
from pathlib import Path

def migrate_prompt_templates():
    """迁移提示词模板"""
    old_prompt_file = Path("app/services/chat/prompt.md")
    new_prompt_file = Path("app/services/chat/prompts/system_prompt.md")
    
    if old_prompt_file.exists():
        content = old_prompt_file.read_text(encoding="utf-8")
        
        # 转换 Jinja2 语法到 LangChain 语法
        content = content.replace("{{", "{").replace("}}", "}")
        
        # 确保目录存在
        new_prompt_file.parent.mkdir(parents=True, exist_ok=True)
        
        # 写入新文件
        new_prompt_file.write_text(content, encoding="utf-8")
        
        print(f"Migrated prompt from {old_prompt_file} to {new_prompt_file}")
```

#### 4.2.2 配置迁移
```python
# 迁移现有的模型配置和工具配置
def migrate_model_configs():
    """迁移模型配置"""
    # 保持现有的模型配置格式
    # 无需特殊迁移
    pass
```

### 4.3 回滚策略

#### 4.3.1 快速回滚
```python
# 在出现问题时快速回滚
async def emergency_rollback():
    """紧急回滚到原实现"""
    # 1. 修改配置
    config.enable_langgraph = False
    
    # 2. 重启服务
    # 3. 监控服务状态
```

#### 4.3.2 数据一致性保证
- 确保两个实现产生的数据格式一致
- 保持消息ID和会话状态的兼容性
- 监控关键指标的连续性

## 5. 风险评估与应对

### 5.1 技术风险

#### 5.1.1 性能风险
**风险：** LangGraph 引入额外的性能开销
**应对措施：**
- 详细的性能测试和基准测试
- 设置性能监控和告警
- 优化关键路径的性能

#### 5.1.2 兼容性风险
**风险：** 输出格式或行为的微小差异
**应对措施：**
- 全面的回归测试
- 端到端的集成测试
- 用户验收测试

#### 5.1.3 依赖风险
**风险：** LangGraph 生态系统的稳定性
**应对措施：**
- 锁定依赖版本
- 准备降级方案
- 跟踪上游项目动态

### 5.2 运维风险

#### 5.2.1 部署风险
**风险：** 新依赖导致的部署问题
**应对措施：**
- 容器化部署
- 充分的测试环境验证
- 分阶段部署策略

#### 5.2.2 监控风险
**风险：** 新架构的监控盲点
**应对措施：**
- 完善监控指标
- 设置关键告警
- 日志增强和分析

### 5.3 业务风险

#### 5.3.1 用户体验风险
**风险：** 响应时间或质量的变化
**应对措施：**
- 用户体验监控
- A/B 测试
- 快速反馈机制

#### 5.3.2 稳定性风险
**风险：** 新实现的稳定性问题
**应对措施：**
- 全面的错误处理
- 快速回滚机制
- 24/7 监控

## 6. 实施计划

### 6.1 时间安排

| 阶段 | 时间 | 关键里程碑 |
|------|------|------------|
| 阶段一 | 第1-4天 | 核心架构搭建完成 |
| 阶段二 | 第5-6天 | 提示词模板重构完成 |
| 阶段三 | 第7-9天 | 服务层重构完成 |
| 阶段四 | 第10-12天 | 集成测试完成 |
| 阶段五 | 第13-15天 | 灰度发布 |
| 阶段六 | 第16-18天 | 全量切换 |

### 6.2 人员分工

**开发团队：**
- 主开发：负责核心架构和节点实现
- 测试开发：负责测试用例编写和验证
- 运维支持：负责部署和监控

**质量保证：**
- 功能测试：验证功能完整性
- 性能测试：验证性能指标
- 安全测试：验证安全性

### 6.3 关键检查点

#### 6.3.1 开发检查点
- [ ] LangGraph 核心模块开发完成
- [ ] 单元测试覆盖率达到80%
- [ ] 集成测试通过
- [ ] 性能测试达标

#### 6.3.2 部署检查点
- [ ] 测试环境部署成功
- [ ] 端到端测试通过
- [ ] 监控系统正常
- [ ] 回滚方案验证

#### 6.3.3 发布检查点
- [ ] 灰度发布无异常
- [ ] 用户反馈正常
- [ ] 关键指标稳定
- [ ] 全量发布准备就绪

## 7. 监控与维护

### 7.1 关键指标监控

#### 7.1.1 性能指标
- 响应时间（P50, P95, P99）
- 吞吐量（QPS）
- 错误率
- 资源使用率（CPU, 内存）

#### 7.1.2 业务指标
- 用户满意度
- 工具调用成功率
- 流式输出稳定性
- 内容质量评分

#### 7.1.3 技术指标
- 图执行时间
- 节点处理时间
- 状态传递效率
- 错误恢复时间

### 7.2 告警机制

#### 7.2.1 严重告警
- 服务不可用
- 响应时间超过阈值
- 错误率异常
- 资源使用过高

#### 7.2.2 警告告警
- 性能下降
- 工具调用失败
- 内存泄漏
- 依赖服务异常

### 7.3 日志策略

#### 7.3.1 结构化日志
```python
# 统一的日志格式
logger.info(
    "Graph execution completed",
    extra={
        "message_id": message_id,
        "execution_time": execution_time,
        "nodes_executed": nodes_executed,
        "tools_called": tools_called,
        "final_state": final_state_summary
    }
)
```

#### 7.3.2 调试日志
- 图执行路径追踪
- 状态变化记录
- 错误栈追踪
- 性能分析数据

## 8. 总结

### 8.1 项目价值

#### 8.1.1 短期价值
- 提升代码可维护性
- 增强错误处理能力
- 改善调试体验
- 为未来功能扩展奠定基础

#### 8.1.2 长期价值
- 支持复杂的多步推理
- 启用高级工作流编排
- 提升系统可扩展性
- 降低技术债务

### 8.2 成功标准

#### 8.2.1 技术标准
- 功能完全兼容
- 性能无显著下降
- 稳定性保持或提升
- 可扩展性增强

#### 8.2.2 业务标准
- 用户体验无负面影响
- 开发效率提升
- 运维成本不增加
- 技术债务减少

### 8.3 后续演进

#### 8.3.1 短期演进
- 优化图执行性能
- 增加更多节点类型
- 完善监控和调试工具
- 扩展工具调用能力

#### 8.3.2 长期演进
- 实现智能路由和负载均衡
- 支持多模型协同
- 引入强化学习优化
- 构建可视化工作流编辑器

---

**注意：** 本方案需要根据实际项目情况进行调整，特别是时间安排和人员分工部分。建议在实施前进行充分的技术预研和风险评估。
