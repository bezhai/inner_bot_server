 Implement the following plan:

  # Agents 模块架构重构计划

  ## 1. 问题总结

  ### 1.1 层级混乱
  - `basic/` 混合了核心抽象、基础设施和共享工具
  - `origin_client.py` 580行包含3个客户端实现 + InstructionBuilder + Modality
  - 各模块对 `basic/` 的依赖方式不一致

  ### 1.2 Agent 模式不一致
  - `main/`: 顶层函数 `stream_chat()`
  - `search/`, `history/`: `@tool` 函数内部创建 ChatAgent
  - `img_gen/`: `@tool` 函数直接用 BaseAIClient
  - `guard/`: LangGraph StateGraph

  ### 1.3 其他问题
  - ContextSchema 所有字段 Optional，需要运行时 assert
  - 硬编码的 model_id 散落各处
  - Guard 每次调用都编译新图
  - 重复的错误处理模式

  ---

  ## 2. 目标架构

  ### 2.1 核心概念定义

  | 概念 | 定义 | 职责 |
  |------|------|------|
  | **Client** | 底层 AI 服务客户端 | 封装具体 API 调用（OpenAI、Ark、Azure） |
  | **Agent** | 具有推理能力的实体 | 使用 LLM 进行多步推理，可调用 Tools |
  | **Tool** | Agent 可调用的能力 | 单一职责的功能单元，无推理能力 |
  | **Graph** | 状态机流程 | 编排多个节点的执行流程（如 Guard） |

  ### 2.2 分层架构

  ```
  agents/
  ├── core/                    # 核心抽象层
  │   ├── __init__.py
  │   ├── base_agent.py        # BaseAgent 抽象基类
  │   ├── context.py           # ContextSchema 重新设计
  │   ├── config.py            # Agent 配置注册表
  │   └── types.py             # 共享类型定义
  │
  ├── clients/                 # AI 客户端层
  │   ├── __init__.py
  │   ├── base.py              # BaseAIClient 抽象
  │   ├── openai_client.py     # OpenAI 实现
  │   ├── ark_client.py        # Ark 实现
  │   ├── azure_http_client.py # Azure HTTP 实现
  │   └── factory.py           # 客户端工厂
  │
  ├── infra/                   # 基础设施层
  │   ├── __init__.py
  │   ├── model_builder.py     # 模型构建（仅构建逻辑）
  │   ├── langfuse.py          # Langfuse 集成
  │   └── embedding/           # Embedding 相关
  │       ├── modality.py
  │       └── instruction_builder.py
  │
  ├── tools/                   # 工具层
  │   ├── __init__.py
  │   ├── base.py              # BaseTool 抽象
  │   ├── decorators.py        # 工具装饰器
  │   ├── search/              # 搜索工具
  │   │   ├── web.py
  │   │   ├── donjin.py
  │   │   └── bangumi.py
  │   ├── history/             # 历史工具
  │   │   ├── search.py
  │   │   └── members.py
  │   ├── image/               # 图片工具
  │   │   └── generate.py
  │   └── memory/              # 记忆工具
  │       └── profile.py
  │
  ├── graphs/                  # Graph 流程层
  │   ├── __init__.py
  │   └── guard/               # Guard 检测图
  │       ├── state.py
  │       ├── nodes.py
  │       └── graph.py
  │
  └── domains/                 # 业务 Agent 层
  ├── __init__.py
  ├── main/                # 主聊天 Agent
  │   ├── agent.py
  │   └── context_builder.py
  ├── search/              # 搜索 Agent
  │   └── agent.py
  └── history/             # 历史 Agent
  └── agent.py
  ```

  ---

  ## 3. 核心抽象设计

  ### 3.1 BaseAgent (core/base_agent.py)

  ```python
  from abc import ABC, abstractmethod
  from typing import AsyncGenerator, Generic, TypeVar
  from langchain_core.messages import BaseMessage, AIMessage
  from app.agents.core.context import AgentContext

  TConfig = TypeVar("TConfig")

  class BaseAgent(ABC, Generic[TConfig]):
  """Agent 抽象基类"""

  def __init__(self, config: TConfig):
  self._config = config
  self._initialized = False

  @abstractmethod
  async def _initialize(self) -> None:
  """初始化 Agent（延迟初始化）"""
  ...

  async def _ensure_initialized(self) -> None:
  if not self._initialized:
  await self._initialize()
  self._initialized = True

  @abstractmethod
  async def stream(
  self,
  messages: list[BaseMessage],
  context: AgentContext,
  ) -> AsyncGenerator[AIMessage, None]:
  ...

  @abstractmethod
  async def run(
  self,
  messages: list[BaseMessage],
  context: AgentContext,
  ) -> AIMessage:
  ...
  ```

  ### 3.2 AgentContext (core/context.py)

  ```python
  from dataclasses import dataclass, field
  from typing import Any

  @dataclass(frozen=True)
  class MessageContext:
  """消息级上下文（必需字段）"""
  message_id: str
  chat_id: str

  @dataclass
  class MediaContext:
  """媒体上下文（可选）"""
  image_urls: list[str] = field(default_factory=list)

  @dataclass
  class UserContext:
  """用户上下文（可选）"""
  user_id_map: bidict[str, str] = field(default_factory=bidict)  # external_id <-> internal_id

  def get_internal_id(self, external_id: str) -> str | None:
  return self.user_id_map.get(external_id)

  def get_external_id(self, internal_id: str) -> str | None:
  return self.user_id_map.inverse.get(internal_id)

  @dataclass
  class FeatureFlags:
  """特性标志（灰度配置）"""
  flags: dict[str, Any] = field(default_factory=dict)

  def get(self, key: str, default: Any = None) -> Any:
  return self.flags.get(key, default)

  @dataclass
  class AgentContext:
  """Agent 执行上下文（组合模式）"""
  message: MessageContext
  media: MediaContext = field(default_factory=MediaContext)
  user: UserContext = field(default_factory=UserContext)
  features: FeatureFlags = field(default_factory=FeatureFlags)
  ```

  ### 3.3 AgentConfig (core/config.py)

  ```python
  from dataclasses import dataclass
  from typing import ClassVar

  @dataclass(frozen=True)
  class AgentConfig:
  """Agent 配置"""
  prompt_id: str
  model_id: str
  trace_name: str | None = None

  class AgentRegistry:
  """Agent 配置注册表"""

  _configs: ClassVar[dict[str, AgentConfig]] = {}

  @classmethod
  def register(cls, name: str, config: AgentConfig) -> None:
  cls._configs[name] = config

  @classmethod
  def get(cls, name: str) -> AgentConfig:
  if name not in cls._configs:
  raise KeyError(f"Unknown agent config: {name}")
  return cls._configs[name]

  # 预注册配置
  AgentRegistry.register("main", AgentConfig(
  prompt_id="main",
  model_id="main-chat-model",
  trace_name="main",
  ))
  AgentRegistry.register("search", AgentConfig(
  prompt_id="search",
  model_id="search-model",
  trace_name="search",
  ))
  AgentRegistry.register("history", AgentConfig(
  prompt_id="history_search",
  model_id="search-history-model",
  trace_name="history",
  ))
  AgentRegistry.register("guard", AgentConfig(
  prompt_id="guard_prompt_injection",  # 有多个 prompt
  model_id="guard-model",
  trace_name="guard",
  ))
  ```

  ---

  ## 4. 客户端层重构

  ### 4.1 拆分 origin_client.py

  **Before**: 1个580行文件
  **After**: 6个文件

  ```
  clients/
  ├── base.py              # BaseAIClient + ClientType 常量
  ├── openai_client.py     # OpenAIClient
  ├── ark_client.py        # ArkClient
  ├── azure_http_client.py # AzureHttpClient
  ├── factory.py           # create_client() 工厂方法
  └── __init__.py          # 导出公共接口
  ```

  ### 4.2 BaseAIClient (clients/base.py)

  ```python
  from abc import ABC, abstractmethod
  from typing import Any, Generic, TypeVar

  ClientT = TypeVar("ClientT")

  class ClientType:
  OPENAI = "openai"
  ARK = "ark"
  AZURE_HTTP = "azure-http"

  class BaseAIClient(ABC, Generic[ClientT]):
  """AI 客户端抽象基类"""

  def __init__(self, model_id: str) -> None:
  self._client: ClientT | None = None
  self.model_id = model_id
  self.model_name: str = ""

  @abstractmethod
  async def _create_client(self, model_info: dict[str, Any]) -> ClientT:
  ...

  async def connect(self) -> None:
  ...

  async def disconnect(self) -> None:
  ...

  async def __aenter__(self) -> "BaseAIClient[ClientT]":
  await self.connect()
  return self

  async def __aexit__(self, *args) -> None:
  await self.disconnect()

  # 能力方法（子类可选实现）
  async def embed(self, text: str | None = None, **kwargs) -> list[float]:
  raise NotImplementedError(f"{self.__class__.__name__} does not support embed")

  async def generate_image(self, prompt: str, size: str, **kwargs) -> list[str]:
  raise NotImplementedError(f"{self.__class__.__name__} does not support generate_image")
  ```

  ### 4.3 客户端工厂 (clients/factory.py)

  ```python
  from app.agents.clients.base import BaseAIClient, ClientType
  from app.agents.clients.openai_client import OpenAIClient
  from app.agents.clients.ark_client import ArkClient
  from app.agents.clients.azure_http_client import AzureHttpClient
  from app.agents.infra.model_builder import ModelBuilder

  async def create_client(model_id: str) -> BaseAIClient:
  """根据模型配置创建合适的客户端"""
  model_info = await ModelBuilder.get_model_info(model_id)
  if model_info is None:
  raise ValueError(f"Model not found: {model_id}")

  client_type = (model_info.get("client_type") or ClientType.OPENAI).lower()

  clients = {
  ClientType.OPENAI: OpenAIClient,
  ClientType.ARK: ArkClient,
  ClientType.AZURE_HTTP: AzureHttpClient,
  }

  client_class = clients.get(client_type)
  if client_class is None:
  raise ValueError(f"Unknown client type: {client_type}")

  return client_class(model_id)
  ```

  ---

  ## 5. 工具层标准化

  ### 5.1 工具装饰器 (tools/decorators.py)

  ```python
  import functools
  import logging
  from typing import Callable, TypeVar, ParamSpec

  P = ParamSpec("P")
  T = TypeVar("T")

  logger = logging.getLogger(__name__)

  def tool_error_handler(
  error_message: str = "操作失败"
  ) -> Callable[[Callable[P, T]], Callable[P, T]]:
  """统一的工具错误处理装饰器"""
  def decorator(func: Callable[P, T]) -> Callable[P, T]:
  @functools.wraps(func)
  async def wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
  try:
  return await func(*args, **kwargs)
  except Exception as e:
  logger.error(f"{func.__name__} failed: {e}", exc_info=True)
  return f"{error_message}: {str(e)}"  # type: ignore
  return wrapper
  return decorator
  ```

  ### 5.2 工具基类 (tools/base.py)

  ```python
  from abc import ABC, abstractmethod
  from typing import Any
  from app.agents.core.context import AgentContext

  class BaseTool(ABC):
  """工具基类（可选使用）"""

  name: str
  description: str

  @abstractmethod
  async def execute(
  self,
  context: AgentContext,
  **kwargs: Any,
  ) -> str | dict[str, Any]:
  ...
  ```

  ---

  ## 6. Guard 模块优化

  ### 6.1 图缓存策略 (graphs/guard/graph.py)

  ```python
  from functools import lru_cache
  from langgraph.graph import StateGraph

  @lru_cache(maxsize=1)
  def get_guard_graph() -> StateGraph:
  """获取编译后的 Guard 图（单例）"""
  return _create_guard_graph().compile()

  def _create_guard_graph() -> StateGraph:
  """创建 Guard 图（内部方法）"""
  builder = StateGraph(GuardState)
  # ... 添加节点和边
  return builder

  async def run_guard(message_content: str) -> GuardState:
  """运行 Guard 检测"""
  graph = get_guard_graph()  # 使用缓存的图
  config = create_trace_config("guard")
  initial_state = GuardState(
  message_content=message_content,
  check_results=[],
  is_blocked=False,
  block_reason=None,
  )
  return await graph.ainvoke(initial_state, config=config)
  ```

  ---

  ## 7. 迁移策略

  **策略选择**: 一次性重构（直接重命名和移动文件，一次性更新所有导入）
  **依赖选择**: 保留 bidict（保持现有依赖，类型更清晰）

  ### Phase 1: 基础设施重构
  1. 创建 `clients/` 目录，拆分 `origin_client.py`
  2. 创建 `infra/embedding/` 目录，移动 InstructionBuilder 和 Modality
  3. 删除旧文件，直接更新所有导入

  **文件变更**:
  - 新建: `clients/base.py`, `clients/openai_client.py`, `clients/ark_client.py`, `clients/azure_http_client.py`,
  `clients/factory.py`
  - 新建: `infra/embedding/modality.py`, `infra/embedding/instruction_builder.py`
  - 删除: `basic/origin_client.py`

  ### Phase 2: 核心抽象引入
  1. 创建 `core/` 目录，定义 BaseAgent、AgentContext、AgentConfig
  2. 重构 ContextSchema -> AgentContext（保留 bidict 用于 user_id_map）
  3. 创建 AgentRegistry，集中管理配置

  **文件变更**:
  - 新建: `core/base_agent.py`, `core/context.py`, `core/config.py`, `core/types.py`
  - 删除: `basic/context.py`

  ### Phase 3: 工具层重组
  1. 创建 `tools/` 目录，移动现有工具
  2. 添加工具装饰器
  3. 统一错误处理

  **文件变更**:
  - 新建: `tools/decorators.py`, `tools/base.py`
  - 移动: `search/tools/*.py` -> `tools/search/`
  - 移动: `history/tools.py` -> `tools/history/`
  - 移动: `memory/tools.py` -> `tools/memory/`

  ### Phase 4: Agent 层统一
  1. 创建 `domains/` 目录，重构各 Agent
  2. ChatAgent 继承 BaseAgent
  3. 统一 Agent 创建模式

  **文件变更**:
  - 移动: `main/` -> `domains/main/`
  - 重构: `basic/agent.py` -> 继承 BaseAgent
  - 更新: search/history agent 使用统一模式

  ### Phase 5: Guard 优化
  1. 移动 Guard 到 `graphs/` 目录
  2. 实现图缓存
  3. 优化节点实现

  **文件变更**:
  - 移动: `guard/` -> `graphs/guard/`
  - 修改: `graphs/guard/graph.py` -> 添加 lru_cache

  ### Phase 6: 清理
  1. 删除空的 `basic/` 目录（所有内容已迁移）
  2. 验证所有导入路径正确
  3. 运行 lint/typecheck 确保无错误

  ---

  ## 8. 关键文件映射

  | 旧路径 | 新路径 | 状态 |
  |--------|--------|------|
  | `basic/origin_client.py` | `clients/*.py` | 拆分 |
  | `basic/context.py` | `core/context.py` | 重构 |
  | `basic/agent.py` | `core/base_agent.py` + `domains/*/agent.py` | 重构 |
  | `basic/model_builder.py` | `infra/model_builder.py` | 移动 |
  | `basic/langfuse.py` | `infra/langfuse.py` | 移动 |
  | `guard/*` | `graphs/guard/*` | 移动 |
  | `search/tools/*` | `tools/search/*` | 移动 |
  | `history/tools.py` | `tools/history/*` | 拆分 |
  | `memory/tools.py` | `tools/memory/profile.py` | 移动 |
  | `main/*` | `domains/main/*` | 移动 |

  ---

  ## 9. 验证计划

  ### 9.1 单元测试
  - 为新的核心抽象编写单元测试
  - 测试客户端工厂创建逻辑
  - 测试 Guard 图缓存行为

  ### 9.2 集成测试
  - 验证 stream_chat 端到端流程
  - 验证工具调用链路
  - 验证 Guard 检测流程

  ### 9.3 手动验证
  ```bash
  # 启动服务
  cd ai-service && python -m uvicorn app.main:app --reload

  # 发送测试请求
  curl -X POST http://localhost:8000/chat/sse \
  -H "Content-Type: application/json" \
  -d '{"message_id": "test_msg_id"}'
  ```

  ---

  ## 10. 风险与缓解

  | 风险 | 影响 | 缓解措施 |
  |------|------|----------|
  | 一次性重构导致大量文件变更 | 高 | 分 Phase 执行，每 Phase 验证后再继续 |
  | Guard 图缓存可能导致状态问题 | 中 | 确保 GuardState 是不可变的 |
  | Context 重构影响所有 Agent | 高 | 提供清晰的迁移步骤，确保类型正确 |
  | 工具移动影响 MAIN_TOOLS 导入 | 低 | 更新 tools/__init__.py 导出 |
