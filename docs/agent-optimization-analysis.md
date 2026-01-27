# AI Agent 架构分析与优化建议

## 当前架构概览

### 核心组件

```
┌─────────────────────────────────────────────────────────────────────┐
│                           请求入口                                   │
│                     POST /chat/sse (FastAPI)                        │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         ChatService                                  │
│                    (process_chat_sse)                               │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      stream_chat (Main Agent)                        │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  1. 获取消息内容                                               │   │
│  │  2. 运行 Pre Graph（并行）                                     │   │
│  │     ├─ 安全检测                                                │   │
│  │     │   ├─ banned_word（快速，无LLM）                          │   │
│  │     │   ├─ prompt_injection（LLM）                             │   │
│  │     │   └─ sensitive_politics（LLM）                           │   │
│  │     └─ 复杂度分类（轻量LLM）                                    │   │
│  │  3. 构建上下文（历史消息、图片处理）                            │   │
│  │  4. 创建 Agent 并流式响应                                      │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          ChatAgent                                   │
│                                                                      │
│  - 延迟初始化 Agent 实例                                             │
│  - 支持 stream() 和 run() 两种模式                                   │
│  - 使用 LangChain create_agent + Langfuse 监控                       │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
              ┌─────────┐  ┌─────────┐  ┌─────────┐
              │ search  │  │ image   │  │ history │
              │  _web   │  │generate │  │ search  │
              └─────────┘  └─────────┘  └─────────┘
```

### 关键代码路径

1. **入口**: `api/chat.py` → `services/chat_service.py`
2. **主流程**: `agents/domains/main/agent.py::stream_chat()`
3. **前置处理**: `agents/graphs/pre/graph.py::run_pre()`
4. **上下文构建**: `agents/domains/main/context_builder.py`
5. **Agent 核心**: `agents/core/agent.py::ChatAgent`

### 当前处理流程时序

```
消息到达 ─┬─► 获取消息内容（DB查询）
          │
          ▼
     Pre Graph ──┬──► banned_word（~5ms，无LLM）
    （并行执行）  ├──► prompt_injection（~200-500ms，LLM）
                 ├──► sensitive_politics（~200-500ms，LLM）
                 └──► complexity_classification（~200-500ms，LLM）
          │
          ▼
    构建上下文 ──┬──► quick_search（DB查询历史消息）
    （串行执行）  ├──► 批量处理图片URL
                 ├──► 获取用户/群组画像
                 └──► 组装消息列表
          │
          ▼
    创建 Agent ──► 初始化模型（每次请求都新建）
          │
          ▼
    流式响应 ──► LLM调用 ──► 工具调用（串行）──► 返回结果
```

---

## 优化方向分析

### 一、响应速度优化

#### 1.1 并行预热（Parallel Warmup）

**问题**: Pre Graph 和 上下文构建 是串行执行的，浪费了等待时间。

**方案**: 在 Pre Graph 执行的同时，并行预热上下文构建。

```python
# 当前实现（串行）
pre_result = await run_pre(message_content)        # 等待完成
messages, image_urls, chat_id = await build_chat_context(message_id)  # 再等待

# 优化实现（并行）
pre_task = asyncio.create_task(run_pre(message_content))
context_task = asyncio.create_task(build_chat_context(message_id))

# 等待所有任务完成
pre_result, (messages, image_urls, chat_id) = await asyncio.gather(
    pre_task, context_task
)

# 如果被拦截，提前返回（context 结果被丢弃）
if pre_result["is_blocked"]:
    return
```

**预期收益**: 减少 ~200-300ms 延迟（取决于上下文构建耗时）

#### 1.2 模型实例缓存

**问题**: 每次请求都调用 `ModelBuilder.build_chat_model()`，涉及数据库查询和实例创建。

**方案**: 实现模型实例缓存，带 TTL 过期机制。

```python
from functools import lru_cache
from cachetools import TTLCache

class ModelBuilder:
    _cache = TTLCache(maxsize=50, ttl=300)  # 5分钟过期
    
    @classmethod
    async def build_chat_model(cls, model_id: str, **kwargs) -> BaseChatModel:
        cache_key = f"{model_id}:{hash(frozenset(kwargs.items()))}"
        
        if cache_key in cls._cache:
            return cls._cache[cache_key]
        
        model = await cls._build_chat_model_impl(model_id, **kwargs)
        cls._cache[cache_key] = model
        return model
```

**预期收益**: 减少 ~50-100ms（数据库查询 + 实例化开销）

#### 1.3 简单问题快速路径（Fast Path）

**问题**: 对于简单的问候语、感谢等，仍然走完整流程。

**方案**: 添加快速路径判断，跳过复杂度分类。

```python
FAST_PATH_PATTERNS = [
    r"^(你好|hi|hello|嗨|早|晚安|谢谢|好的|收到|ok|嗯|哦)[\s!！。.]*$",
]

def is_simple_greeting(message: str) -> bool:
    message = message.strip().lower()
    return any(re.match(p, message, re.I) for p in FAST_PATH_PATTERNS)

async def stream_chat(message_id: str):
    message_content = await get_message_content(message_id)
    
    # 快速路径：简单问候直接跳过复杂度分类
    if is_simple_greeting(message_content):
        complexity = Complexity.SIMPLE
        is_blocked = await check_banned_word_only(message_content)  # 只做关键词检测
    else:
        pre_result = await run_pre(message_content)
        is_blocked = pre_result["is_blocked"]
        complexity = pre_result["complexity_result"].complexity
```

**预期收益**: 简单问候响应时间减少 ~400-800ms

#### 1.4 流式输出更早开始

**问题**: 需要等待 Agent 完成初始化后才开始流式输出。

**方案**: 在构建上下文的同时发送"思考中"状态。

```python
async def stream_chat(message_id: str) -> AsyncGenerator[ChatStreamChunk, None]:
    # 立即发送开始状态
    yield ChatStreamChunk(status_message="正在理解您的问题...")
    
    # 并行执行预处理
    pre_task = asyncio.create_task(run_pre(message_content))
    context_task = asyncio.create_task(build_chat_context(message_id))
    
    yield ChatStreamChunk(status_message="正在准备回复...")
    
    pre_result, context = await asyncio.gather(pre_task, context_task)
    # ...
```

**预期收益**: 用户感知的首字节时间（TTFB）显著降低

---

### 二、智能化优化

#### 2.1 动态工具选择（Dynamic Tool Selection）

**问题**: 目前所有工具始终可用，增加了 LLM 的决策负担。

**方案**: 根据复杂度分类动态调整可用工具集。

```python
# agents/domains/main/tools.py

SIMPLE_TOOLS = []  # 简单问题不需要工具

BASIC_TOOLS = [
    search_web,
    search_donjin_event,
]

FULL_TOOLS = [
    search_web,
    search_donjin_event,
    search_group_history,
    list_group_members,
    generate_image,
]

def get_tools_by_complexity(complexity: Complexity) -> list:
    """根据复杂度返回适当的工具集"""
    return {
        Complexity.SIMPLE: SIMPLE_TOOLS,
        Complexity.COMPLEX: BASIC_TOOLS,
        Complexity.SUPER_COMPLEX: FULL_TOOLS,
    }.get(complexity, BASIC_TOOLS)
```

**预期收益**: 
- 简单问题减少工具描述 token（~500-1000 tokens）
- 降低 LLM 错误调用工具的概率

#### 2.2 工具结果缓存（Tool Result Caching）

**问题**: 相同的搜索查询可能在短时间内被多次执行。

**方案**: 实现工具级别的结果缓存。

```python
from functools import wraps
from cachetools import TTLCache

def cached_tool(ttl: int = 300, maxsize: int = 100):
    """工具结果缓存装饰器"""
    cache = TTLCache(maxsize=maxsize, ttl=ttl)
    
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            cache_key = f"{func.__name__}:{hash((args, frozenset(kwargs.items())))}"
            if cache_key in cache:
                return cache[cache_key]
            result = await func(*args, **kwargs)
            cache[cache_key] = result
            return result
        return wrapper
    return decorator

@tool
@cached_tool(ttl=60)  # 缓存1分钟
async def search_web(query: str, **kwargs) -> list[dict]:
    # ...
```

#### 2.3 记忆系统增强（Memory Enhancement）

**当前状态**: L2（话题）和 L3（画像）记忆是异步后台更新的。

**优化方向**:

```python
# 1. 在上下文构建时注入相关记忆
async def build_chat_context(message_id: str) -> tuple:
    # 并行获取基础上下文和记忆
    base_context_task = asyncio.create_task(_build_base_context(message_id))
    memory_task = asyncio.create_task(_fetch_relevant_memory(message_id))
    
    base_context, memory = await asyncio.gather(base_context_task, memory_task)
    
    # 将记忆注入到上下文中
    return _merge_context_with_memory(base_context, memory)

async def _fetch_relevant_memory(message_id: str) -> dict:
    """获取相关记忆"""
    return {
        "active_topics": await get_active_topics(chat_id),
        "user_profile": await fetch_user_profile(user_id),
        "group_profile": await fetch_group_profile(chat_id),
    }
```

#### 2.4 多模型策略（Multi-Model Strategy）

**问题**: 目前通过 gray_config 选择模型，但策略较简单。

**方案**: 实现更智能的模型路由。

```python
class ModelRouter:
    """智能模型路由器"""
    
    TASK_MODEL_MAPPING = {
        "simple_chat": "fast-model",       # 快速响应
        "complex_reasoning": "main-model", # 深度推理
        "code_generation": "code-model",   # 代码生成
        "image_understanding": "vision-model",  # 视觉理解
    }
    
    @classmethod
    def select_model(
        cls,
        complexity: Complexity,
        has_images: bool,
        task_hint: str | None = None,
    ) -> str:
        # 有图片时使用视觉模型
        if has_images:
            return cls.TASK_MODEL_MAPPING["image_understanding"]
        
        # 根据复杂度选择
        if complexity == Complexity.SIMPLE:
            return cls.TASK_MODEL_MAPPING["simple_chat"]
        
        return cls.TASK_MODEL_MAPPING["complex_reasoning"]
```

---

### 三、架构优化

#### 3.1 子 Agent 支持（Sub-Agent）

**问题**: `SUPER_COMPLEX` 任务预留了子 Agent 接口，但未实现。

**方案**: 实现 Orchestrator + Sub-Agent 架构。

```python
# agents/domains/main/orchestrator.py

class TaskOrchestrator:
    """任务编排器"""
    
    def __init__(self):
        self.sub_agents = {
            "research": ResearchAgent(),    # 深度研究
            "code_review": CodeReviewAgent(),  # 代码审查
            "data_analysis": DataAnalysisAgent(),  # 数据分析
        }
    
    async def execute(
        self,
        task: str,
        complexity: Complexity,
        context: ContextSchema,
    ) -> AsyncGenerator[ChatStreamChunk, None]:
        if complexity != Complexity.SUPER_COMPLEX:
            # 普通任务直接执行
            async for chunk in self.main_agent.stream(task, context):
                yield chunk
            return
        
        # 复杂任务：分解 + 委派
        plan = await self.plan_task(task)
        
        for step in plan.steps:
            agent = self.sub_agents.get(step.agent_type)
            if agent:
                async for chunk in agent.execute(step, context):
                    yield chunk
        
        # 汇总结果
        async for chunk in self.summarize(plan):
            yield chunk
```

#### 3.2 工具并行执行（Parallel Tool Execution）

**问题**: 多个独立的工具调用是串行执行的。

**方案**: 检测工具调用依赖关系，并行执行独立调用。

```python
# agents/core/tool_executor.py

class ParallelToolExecutor:
    """并行工具执行器"""
    
    async def execute_tools(
        self,
        tool_calls: list[ToolCall],
    ) -> list[ToolResult]:
        # 分析依赖关系
        independent_calls = self._find_independent_calls(tool_calls)
        dependent_calls = [c for c in tool_calls if c not in independent_calls]
        
        # 并行执行独立调用
        independent_results = await asyncio.gather(*[
            self._execute_single(call) for call in independent_calls
        ])
        
        # 串行执行依赖调用
        dependent_results = []
        for call in dependent_calls:
            result = await self._execute_single(call)
            dependent_results.append(result)
        
        return independent_results + dependent_results
    
    def _find_independent_calls(self, calls: list[ToolCall]) -> list[ToolCall]:
        """识别相互独立的工具调用"""
        # 分析参数依赖关系
        # ...
```

#### 3.3 Prompt 优化

**当前**: Prompt 通过 Langfuse 管理，包含复杂度引导。

**优化建议**:

```python
# 1. 分层 Prompt 结构
SYSTEM_PROMPT_LAYERS = {
    "base": "基础人设和行为规范",
    "context": "当前对话上下文",
    "memory": "相关记忆和画像",
    "task": "任务引导（根据复杂度）",
}

# 2. 动态 Prompt 压缩
async def compress_prompt_if_needed(
    prompt: str,
    max_tokens: int = 4000,
) -> str:
    """当 prompt 过长时进行压缩"""
    token_count = count_tokens(prompt)
    if token_count <= max_tokens:
        return prompt
    
    # 压缩历史消息
    return await summarize_history(prompt, target_tokens=max_tokens)
```

---

### 四、可观测性增强

#### 4.1 性能指标追踪

```python
# utils/metrics.py

from prometheus_client import Histogram, Counter

RESPONSE_LATENCY = Histogram(
    "agent_response_latency_seconds",
    "Agent response latency",
    ["complexity", "has_tools"],
    buckets=[0.5, 1, 2, 5, 10, 30],
)

TOOL_CALL_COUNTER = Counter(
    "agent_tool_calls_total",
    "Total tool calls",
    ["tool_name", "success"],
)

PRE_GRAPH_LATENCY = Histogram(
    "pre_graph_latency_seconds",
    "Pre-graph processing latency",
    ["node_name"],
)
```

#### 4.2 追踪链路完善

```python
# 在关键节点添加 span

async def stream_chat(message_id: str):
    with tracer.start_span("stream_chat") as span:
        span.set_attribute("message_id", message_id)
        
        with tracer.start_span("pre_graph"):
            pre_result = await run_pre(message_content)
        
        with tracer.start_span("context_build"):
            messages, image_urls, chat_id = await build_chat_context(message_id)
        
        with tracer.start_span("agent_stream"):
            async for token in agent.stream(...):
                yield token
```

---

## 优先级建议

### P0 - 立即实施（高收益、低风险）

1. **并行预热**：Pre Graph 和上下文构建并行执行
2. **简单问题快速路径**：跳过复杂度分类
3. **工具结果缓存**：减少重复调用

### P1 - 短期实施（中等收益、中等风险）

4. **模型实例缓存**：减少初始化开销
5. **动态工具选择**：根据复杂度调整工具集
6. **流式输出更早开始**：改善用户感知

### P2 - 中期规划（需要更多设计）

7. **工具并行执行**：需要依赖分析
8. **多模型策略**：需要更多测试
9. **记忆系统增强**：需要数据验证

### P3 - 长期规划（较大改动）

10. **子 Agent 架构**：复杂任务分解
11. **Prompt 动态压缩**：处理超长上下文

---

## 实施示例：P0 优化

以下是 P0 优化的具体实现示例：

```python
# agents/domains/main/agent.py

import asyncio
import re
from collections.abc import AsyncGenerator

from app.agents.core import ChatAgent, ContextSchema
from app.agents.domains.main.context_builder import build_chat_context
from app.agents.domains.main.tools import ALL_TOOLS
from app.agents.graphs.pre import Complexity, run_pre
from app.orm.crud import get_gray_config, get_message_content
from app.services.banned_word import check_banned_word
from app.types.chat import ChatStreamChunk

# 快速路径模式
FAST_PATH_PATTERNS = [
    r"^(你好|hi|hello|嗨|早|晚安|谢谢|好的|收到|ok|嗯|哦)[\s!！。.]*$",
]

def is_simple_greeting(message: str) -> bool:
    message = message.strip().lower()
    return any(re.match(p, message, re.I) for p in FAST_PATH_PATTERNS)


async def stream_chat(message_id: str) -> AsyncGenerator[ChatStreamChunk, None]:
    """优化后的主聊天流式响应入口"""
    
    # 1. 获取消息内容
    message_content = await get_message_content(message_id)
    if not message_content:
        yield ChatStreamChunk(content="抱歉，未找到相关消息记录")
        return
    
    # 2. 快速路径检查
    if is_simple_greeting(message_content):
        # 只做关键词检测
        banned = await check_banned_word(message_content)
        if banned:
            yield ChatStreamChunk(content="你发了一些赤尾不想讨论的话题呢~")
            return
        
        complexity = Complexity.SIMPLE
        # 直接构建上下文（跳过其他安全检测和复杂度分类）
        messages, image_urls, chat_id = await build_chat_context(message_id)
    else:
        # 3. 并行执行 Pre Graph 和上下文构建
        pre_task = asyncio.create_task(run_pre(message_content))
        context_task = asyncio.create_task(build_chat_context(message_id))
        
        # 等待两者完成
        pre_result, (messages, image_urls, chat_id) = await asyncio.gather(
            pre_task, context_task
        )
        
        # 4. 安全拦截
        if pre_result["is_blocked"]:
            yield ChatStreamChunk(content="你发了一些赤尾不想讨论的话题呢~")
            return
        
        complexity = (
            pre_result["complexity_result"].complexity
            if pre_result["complexity_result"]
            else Complexity.SIMPLE
        )
    
    if not messages:
        yield ChatStreamChunk(content="抱歉，未找到相关消息记录")
        return
    
    # 5. 获取 gray_config 和创建 agent（可以并行）
    gray_config = (await get_gray_config(message_id)) or {}
    model_id = gray_config.get("main_model", "main-chat-model")
    
    agent = ChatAgent(
        "main",
        ALL_TOOLS,
        model_id=model_id,
        trace_name="main",
    )
    
    # 6. 流式响应
    # ... 其余逻辑保持不变
```

---

## 总结

当前 AI Agent 架构设计合理，采用了 LangGraph + LangChain 的标准模式，具备良好的扩展性。主要优化方向集中在：

1. **延迟优化**：通过并行化、缓存、快速路径等手段减少响应时间
2. **智能提升**：动态工具选择、多模型策略、记忆增强等
3. **架构演进**：子 Agent、工具并行执行等更复杂的改进

建议按优先级逐步实施，每次改动后通过 A/B 测试验证效果，确保改进可量化、可回滚。
