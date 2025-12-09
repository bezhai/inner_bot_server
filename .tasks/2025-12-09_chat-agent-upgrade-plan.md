# 背景
文件名：2025-12-09_chat-agent-upgrade-plan.md
创建于：2025-12-09
创建者：Claude
主分支：master
任务分支：cursor/upgrade-chat-agent-capabilities-4b68
Yolo模式：Off
flow: standard

# 任务描述
对目前聊天agent能力进行全面升级，包含以下核心目标：
1. 记忆能力深耕 - 优化多层级记忆系统
2. 工具扩展 - 接入20+工具
3. 多层Agent架构 - 风险过滤、意图识别
4. 多模态能力提升 - 图片搜索、跨agent多模态交互
5. 异步交互 - Human in the loop、MCP支持

# 项目概览
- 主项目：Inner Bot Server (飞书机器人服务)
- AI Service：Python/FastAPI，使用 LangChain + LangGraph
- Main Server：Node.js/TypeScript/Koa，负责飞书集成
- 基础设施：PostgreSQL、MongoDB、Redis、Qdrant、Elasticsearch

⚠️ 警告：永远不要修改此部分 ⚠️
[RIPER-5协议规则摘要]
- RESEARCH模式：只观察和问题，禁止建议实施
- INNOVATE模式：讨论多种解决方案，禁止具体规划
- PLAN模式：创建详尽规范，禁止代码编写
- EXECUTE模式：100%忠实遵循计划
- REVIEW模式：无情验证实施与计划的符合程度
⚠️ 警告：永远不要修改此部分 ⚠️

---

# 分析

## 1. 现有记忆系统分析

### 1.1 当前架构
```
L1: quick_search.py
├── 基于PostgreSQL的简单消息查询
├── 按root_message_id获取对话历史
└── 时间窗口补充（30分钟）

L2: l2_topic_service.py
├── TopicMemory表 (id, group_id, title, summary)
├── 使用Agent重写话题
├── 基于队列触发更新
└── 每5分钟扫描/阈值触发

L3: l3_memory_service.py
├── UserProfile表 (user_id, profile)
├── GroupProfile表 (chat_id, profile)
├── 使用Agent工具(get_profiles, update_profiles)
└── 每30分钟定时更新

向量检索: qdrant.py
├── messages集合 (1536维向量)
├── group_memories集合
└── 带时间权重的相似度搜索
```

### 1.2 问题诊断
| 问题 | 详情 | 影响 |
|------|------|------|
| 画像粗糙 | profile只是一段markdown文本，无结构化 | 难以精准检索和利用 |
| 缺乏事实记忆 | 没有存储具体事实/知识的机制 | 无法记住具体信息 |
| L2话题过于临时 | 话题只有3小时有效期 | 无法追溯历史话题 |
| 缺乏情感记忆 | 没有记录用户情感偏好 | 交互体验不够个性化 |
| 记忆无版本管理 | MemoryVersion表存在但未使用 | 无法追溯记忆变化 |
| 缺乏关系记忆 | 没有用户间关系图谱 | 不理解社交关系 |

## 2. 现有工具分析

### 2.1 当前工具清单
```
Main Agent Tools (3个):
├── unified_search  -> 搜索子Agent
├── generate_image  -> 图片生成
└── search_history  -> 历史子Agent

Search Agent Tools (12个):
├── search_web           -> Web搜索
├── search_donjin_event  -> 同人展搜索
├── search_subjects      -> Bangumi条目搜索
├── search_characters    -> Bangumi角色搜索
├── search_persons       -> Bangumi人物搜索
├── get_subject_characters
├── get_subject_persons
├── get_subject_relations
├── get_character_subjects
├── get_character_persons
├── get_person_characters
└── get_person_subjects

History Agent Tools (2个):
├── search_messages      -> 消息搜索
└── list_group_members   -> 群成员列表

Memory Agent Tools (2个):
├── get_profiles         -> 获取画像
└── update_profiles      -> 更新画像

总计：约15个工具（含子Agent）
```

### 2.2 工具缺口分析
| 类别 | 缺失能力 | 建议新增 |
|------|----------|----------|
| 搜索 | 图片搜索、新闻搜索、知识库搜索 | 3个 |
| 执行 | 代码执行、文件操作、数据处理 | 3个 |
| 交互 | 消息发送、卡片创建、投票创建 | 3个 |
| 多媒体 | 视频处理、音频转文字、图片编辑 | 3个 |
| 记忆 | 记忆检索、关系查询、事实存储 | 3个 |
| 外部 | 天气查询、日历集成、待办管理 | 3个 |
| 计算 | 数学计算、单位转换、时间计算 | 2个 |

## 3. 现有Agent架构分析

### 3.1 当前架构
```
Main Agent (ChatAgent)
├── 模型: gemini-2.5-flash-preview-09-2025
├── Prompt: langfuse管理
├── Tools: [unified_search, generate_image, search_history]
└── 流式输出 -> SSE -> 飞书卡片

Sub-Agents:
├── Search Agent (模型: grok-4-fast-reasoning)
├── History Agent (模型: gemini-2.5-flash)
└── Profile Agent (模型: gpt-5-mini)
```

### 3.2 架构问题
| 问题 | 详情 |
|------|------|
| 扁平结构 | 只有一层主Agent + 工具子Agent |
| 无意图识别 | 没有前置的意图分类 |
| 无风险过滤 | 没有内容安全预检 |
| 无路由机制 | 所有请求同一处理流程 |
| 上下文注入静态 | context_builder固定逻辑 |

## 4. 多模态能力分析

### 4.1 当前能力
- ✅ 图片接收: 从飞书消息提取图片
- ✅ 图片处理: image_client处理图片URL
- ✅ 图片生成: generate_image工具
- ✅ 参考图生成: 支持参考图片列表
- ❌ 图片搜索: 无
- ❌ 图片理解: 无专门的图片理解Agent
- ❌ 跨Agent图片传递: 子Agent无法访问图片上下文

### 4.2 问题
| 问题 | 影响 |
|------|------|
| 子Agent无法看图 | 搜索Agent无法理解图片内容 |
| 无图搜图能力 | 无法根据图片搜索相似图 |
| 图片上下文丢失 | 多轮对话中图片引用困难 |

## 5. 异步交互能力分析

### 5.1 当前能力
- ✅ 长期任务框架: long_tasks (PostgreSQL + arq)
- ✅ SSE流式响应: 实时输出
- ✅ 定时任务: arq cron jobs
- ❌ Human in the Loop: 无
- ❌ MCP协议: 无
- ❌ 中断/恢复: 无
- ❌ 用户确认机制: 无

---

# 提议的解决方案

## 方案1：记忆系统深度重构

### 1.1 多层记忆架构 (MLMA)
```
┌─────────────────────────────────────────────────────────────────┐
│                        Memory Orchestrator                       │
│  (统一记忆访问接口，智能选择检索策略)                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
     ┌───────────────────────┼───────────────────────┐
     │                       │                       │
┌────▼─────┐          ┌──────▼──────┐         ┌──────▼──────┐
│ L1 短期  │          │  L2 会话   │         │  L3 长期   │
│ Working  │          │  Episodic  │         │  Semantic  │
│ Memory   │          │  Memory    │         │  Memory    │
└────┬─────┘          └──────┬──────┘         └──────┬──────┘
     │                       │                       │
  Redis                  PostgreSQL              Qdrant
  (实时上下文)           (结构化事实)           (语义向量)
```

### 1.2 结构化记忆设计
```python
# 事实记忆表
class FactMemory:
    id: UUID
    subject_type: str  # user/group/topic
    subject_id: str
    fact_type: str     # preference/info/event/relationship
    fact_key: str      # 例如 "favorite_anime"
    fact_value: str    # 例如 "《进击的巨人》"
    confidence: float  # 置信度 0-1
    source_message_id: str
    created_at: datetime
    last_confirmed_at: datetime
    version: int

# 关系记忆表
class RelationshipMemory:
    id: UUID
    from_user_id: str
    to_user_id: str
    relationship_type: str  # friend/colleague/family
    strength: float         # 0-1
    context_group_id: str
    evidence_count: int

# 情感记忆表
class EmotionalMemory:
    id: UUID
    user_id: str
    chat_id: str
    emotion_type: str    # positive/negative/neutral
    intensity: float
    trigger_topic: str
    message_id: str
    created_at: datetime
```

### 1.3 记忆工具集扩展
```python
# 新增工具
store_fact()       # 存储事实
query_facts()      # 查询事实
update_fact()      # 更新事实
forget_fact()      # 遗忘事实(降低置信度)
link_users()       # 建立用户关系
query_relations()  # 查询用户关系
log_emotion()      # 记录情感
```

## 方案2：工具体系扩展

### 2.1 工具分类架构
```
Tools Registry
├── Core Tools (核心工具)
│   ├── memory_*        # 记忆操作
│   ├── search_*        # 搜索能力
│   └── generate_*      # 生成能力
│
├── External Tools (外部集成)
│   ├── weather         # 天气查询
│   ├── calendar        # 日历操作
│   ├── reminder        # 提醒设置
│   └── news            # 新闻聚合
│
├── Media Tools (多媒体)
│   ├── image_search    # 以图搜图
│   ├── image_edit      # 图片编辑
│   ├── image_analyze   # 图片分析
│   └── audio_transcribe # 音频转文字
│
├── Compute Tools (计算)
│   ├── calculator      # 数学计算
│   ├── unit_convert    # 单位转换
│   ├── time_calc       # 时间计算
│   └── code_execute    # 代码执行
│
└── Interaction Tools (交互)
    ├── send_message    # 发送消息
    ├── create_card     # 创建卡片
    ├── create_poll     # 创建投票
    └── schedule_task   # 计划任务
```

### 2.2 工具注册机制
```python
@tool_register(
    category="media",
    requires_auth=False,
    rate_limit=10,
    timeout=30,
)
async def image_search(query_image: str) -> list[ImageResult]:
    """以图搜图"""
    pass
```

## 方案3：多层Agent架构

### 3.1 层级设计
```
User Request
     │
     ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Gateway Layer                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Rate Limiter│  │ Auth Check  │  │ Request Normalizer     │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Safety Layer                                │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Safety Agent                             ││
│  │  - Content moderation (敏感词/违规检测)                     ││
│  │  - Risk scoring (风险评分)                                  ││
│  │  - Action: PASS / WARN / BLOCK / REWRITE                   ││
│  └─────────────────────────────────────────────────────────────┘│
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Intent Layer                                │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Intent Agent                             ││
│  │  - 意图分类 (chat/search/create/query/task)                ││
│  │  - 上下文筛选 (选择相关记忆)                                ││
│  │  - 参数提取 (entities/slots)                               ││
│  │  - 路由决策 (选择专家Agent)                                 ││
│  └─────────────────────────────────────────────────────────────┘│
└────────────────────────────┬────────────────────────────────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
           ▼                 ▼                 ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│   Chat Expert    │ │  Search Expert   │ │  Task Expert     │
│   (闲聊/情感)    │ │  (信息检索)      │ │  (任务执行)      │
└──────────────────┘ └──────────────────┘ └──────────────────┘
           │                 │                 │
           └─────────────────┼─────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Response Layer                              │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Response Agent                           ││
│  │  - 输出安全检查                                             ││
│  │  - 格式化/本地化                                            ││
│  │  - 记忆更新触发                                             ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 专家Agent设计
```python
# Agent基类增强
class ExpertAgent(ChatAgent):
    expert_type: str
    capabilities: list[str]
    
    async def can_handle(self, intent: Intent) -> float:
        """返回处理该意图的置信度"""
        pass
    
    async def handoff(self, target_agent: str, context: dict):
        """移交给其他Agent"""
        pass
```

## 方案4：多模态能力增强

### 4.1 统一多模态上下文
```python
@dataclass
class MultiModalContext:
    text_messages: list[Message]
    images: list[ImageContext]
    audio_clips: list[AudioContext]
    
@dataclass  
class ImageContext:
    url: str
    description: str  # 由Vision模型生成
    embedding: list[float]  # CLIP embedding
    source_message_id: str
```

### 4.2 图片理解Pipeline
```
Image Input
     │
     ▼
┌─────────────────┐
│ Vision Agent    │
│ (GPT-4V/Gemini) │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
Description  Embedding
    │         │
    ▼         ▼
Text Context  Vector DB
```

### 4.3 新增多模态工具
```python
analyze_image()     # 分析图片内容
search_similar_images()  # 以图搜图
edit_image()        # 编辑图片
describe_image()    # 描述图片
compare_images()    # 比较图片
```

## 方案5：异步交互机制

### 5.1 Human in the Loop
```python
class HITLRequest(BaseModel):
    request_id: str
    agent_id: str
    question: str
    options: list[str] | None
    input_type: str  # text/choice/confirm
    timeout_seconds: int
    default_action: str

class HITLResponse(BaseModel):
    request_id: str
    user_response: str
    timestamp: datetime
```

### 5.2 交互流程
```
Agent执行中
     │
     ▼
需要用户确认
     │
     ▼
┌──────────────────────────────────────┐
│ 1. 暂停当前任务                       │
│ 2. 发送确认卡片到飞书                 │
│ 3. 等待用户响应(带超时)               │
│ 4. 恢复任务执行                       │
└──────────────────────────────────────┘
```

### 5.3 MCP协议集成
```
┌─────────────────────────────────────────────────────────────────┐
│                        MCP Server                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Tools       │  │ Resources   │  │ Prompts                 │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │ JSON-RPC
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                        MCP Client                                │
│  (集成到LangChain工具调用流程)                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

# 详细实施计划

## 第一阶段：基础设施与核心框架 (Phase 1)

### P1.1 工具注册系统重构

**目标**：建立统一的工具注册、发现和管理机制

**文件清单**：
```
ai-service/app/agents/tools/
├── __init__.py           # 新建：工具模块入口
├── registry.py           # 新建：工具注册中心
├── base.py               # 新建：工具基类定义
├── decorators.py         # 新建：工具装饰器
└── types.py              # 新建：工具类型定义
```

**核心设计**：

```python
# ai-service/app/agents/tools/types.py
from enum import Enum
from pydantic import BaseModel
from typing import Callable, Any

class ToolCategory(str, Enum):
    CORE = "core"
    SEARCH = "search"
    MEDIA = "media"
    MEMORY = "memory"
    COMPUTE = "compute"
    EXTERNAL = "external"
    INTERACTION = "interaction"

class ToolMetadata(BaseModel):
    name: str
    category: ToolCategory
    description: str
    requires_auth: bool = False
    rate_limit: int | None = None
    timeout: int = 30
    requires_multimodal: bool = False
    tags: list[str] = []
```

```python
# ai-service/app/agents/tools/registry.py
from typing import Dict, List, Callable
from .types import ToolMetadata, ToolCategory

class ToolRegistry:
    _instance = None
    _tools: Dict[str, tuple[Callable, ToolMetadata]] = {}
    
    @classmethod
    def get_instance(cls) -> "ToolRegistry":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
    
    def register(self, func: Callable, metadata: ToolMetadata) -> None:
        self._tools[metadata.name] = (func, metadata)
    
    def get_tool(self, name: str) -> Callable | None:
        return self._tools.get(name, (None, None))[0]
    
    def get_tools_by_category(self, category: ToolCategory) -> List[Callable]:
        return [
            func for func, meta in self._tools.values() 
            if meta.category == category
        ]
    
    def get_all_tools(self) -> List[Callable]:
        return [func for func, _ in self._tools.values()]
    
    def get_tool_metadata(self, name: str) -> ToolMetadata | None:
        return self._tools.get(name, (None, None))[1]
```

```python
# ai-service/app/agents/tools/decorators.py
from functools import wraps
from langchain_core.tools import tool
from .registry import ToolRegistry
from .types import ToolMetadata, ToolCategory

def register_tool(
    category: ToolCategory,
    requires_auth: bool = False,
    rate_limit: int | None = None,
    timeout: int = 30,
    requires_multimodal: bool = False,
    tags: list[str] = None,
):
    def decorator(func):
        # 使用langchain的tool装饰器
        wrapped = tool(func)
        
        metadata = ToolMetadata(
            name=func.__name__,
            category=category,
            description=func.__doc__ or "",
            requires_auth=requires_auth,
            rate_limit=rate_limit,
            timeout=timeout,
            requires_multimodal=requires_multimodal,
            tags=tags or [],
        )
        
        ToolRegistry.get_instance().register(wrapped, metadata)
        return wrapped
    return decorator
```

**修改现有文件**：

1. `ai-service/app/agents/search/tools/web.py`:
```python
# 修改前
from langchain_core.tools import tool

@tool
async def search_web(...):
    ...

# 修改后
from app.agents.tools.decorators import register_tool
from app.agents.tools.types import ToolCategory

@register_tool(
    category=ToolCategory.SEARCH,
    rate_limit=10,
    timeout=30,
    tags=["web", "search"]
)
async def search_web(...):
    ...
```

2. 对以下文件进行相同模式的修改：
   - `ai-service/app/agents/search/tools/bangumi.py` (12个工具)
   - `ai-service/app/agents/history/tools.py` (2个工具)
   - `ai-service/app/agents/memory/tools.py` (2个工具)
   - `ai-service/app/agents/img_gen/agent.py` (1个工具)

---

### P1.2 多模态上下文框架

**目标**：建立统一的多模态数据结构和传递机制

**文件清单**：
```
ai-service/app/types/
├── multimodal.py         # 新建：多模态类型定义
└── context.py            # 修改：扩展现有上下文

ai-service/app/services/
├── vision_service.py     # 新建：图片理解服务
└── image_embedding.py    # 新建：图片向量化服务
```

**核心设计**：

```python
# ai-service/app/types/multimodal.py
from dataclasses import dataclass, field
from typing import Optional
from datetime import datetime

@dataclass
class ImageContext:
    """图片上下文"""
    image_key: str
    url: str | None = None
    description: str | None = None  # Vision模型生成的描述
    embedding: list[float] | None = None  # CLIP embedding
    source_message_id: str | None = None
    created_at: datetime = field(default_factory=datetime.now)
    
@dataclass
class AudioContext:
    """音频上下文"""
    audio_key: str
    url: str | None = None
    transcript: str | None = None
    duration_seconds: float | None = None
    source_message_id: str | None = None

@dataclass
class MultiModalContext:
    """统一的多模态上下文"""
    images: list[ImageContext] = field(default_factory=list)
    audio_clips: list[AudioContext] = field(default_factory=list)
    
    def has_images(self) -> bool:
        return len(self.images) > 0
    
    def get_image_descriptions(self) -> list[str]:
        return [img.description for img in self.images if img.description]
    
    def to_text_context(self) -> str:
        """将多模态上下文转换为文本描述"""
        parts = []
        if self.images:
            parts.append(f"[附带{len(self.images)}张图片]")
            for i, img in enumerate(self.images):
                if img.description:
                    parts.append(f"  图片{i+1}: {img.description}")
        if self.audio_clips:
            parts.append(f"[附带{len(self.audio_clips)}段音频]")
            for i, audio in enumerate(self.audio_clips):
                if audio.transcript:
                    parts.append(f"  音频{i+1}: {audio.transcript}")
        return "\n".join(parts)
```

```python
# ai-service/app/services/vision_service.py
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
from app.types.multimodal import ImageContext
from app.config.config import settings
import base64
import httpx

class VisionService:
    def __init__(self):
        self.model = ChatOpenAI(
            model="gpt-4o",
            api_key=settings.openai_api_key,
        )
    
    async def analyze_image(self, image_url: str) -> str:
        """分析图片并返回描述"""
        message = HumanMessage(
            content=[
                {"type": "text", "text": "请简洁描述这张图片的主要内容，用于AI助手理解图片上下文。"},
                {"type": "image_url", "image_url": {"url": image_url}},
            ]
        )
        response = await self.model.ainvoke([message])
        return response.content
    
    async def enrich_image_context(self, images: list[ImageContext]) -> list[ImageContext]:
        """批量丰富图片上下文"""
        enriched = []
        for img in images:
            if img.url and not img.description:
                img.description = await self.analyze_image(img.url)
            enriched.append(img)
        return enriched

vision_service = VisionService()
```

**修改 context_builder.py**：

```python
# ai-service/app/agents/main/context_builder.py
# 在现有导入后添加
from app.types.multimodal import MultiModalContext, ImageContext
from app.services.vision_service import vision_service

# 修改 build_context 函数签名
async def build_context(
    request: ChatRequest,
    image_client: ImageProcessClient,
    enrich_images: bool = True,  # 新增：是否丰富图片上下文
) -> tuple[list[BaseMessage], MultiModalContext]:  # 返回类型变更
    ...
    
    # 构建多模态上下文
    multimodal_ctx = MultiModalContext()
    if image_urls:
        for url in image_urls:
            img_ctx = ImageContext(
                image_key=...,
                url=url,
                source_message_id=request.root_message_id,
            )
            multimodal_ctx.images.append(img_ctx)
        
        # 可选：丰富图片描述
        if enrich_images:
            multimodal_ctx.images = await vision_service.enrich_image_context(
                multimodal_ctx.images
            )
    
    return messages, multimodal_ctx
```

---

### P1.3 数据库 Schema 扩展

**目标**：添加结构化记忆所需的数据表

**文件清单**：
```
schema/
├── schema.pg.hcl         # 修改：添加新表定义
└── memory_tables.pg.hcl  # 新建：记忆相关表

ai-service/app/orm/
├── models.py             # 修改：添加新ORM模型
└── crud.py               # 修改：添加新CRUD操作
```

**Schema 定义**：

```hcl
# schema/memory_tables.pg.hcl

# 事实记忆表
table "fact_memory" {
  schema = schema.public
  
  column "id" {
    type = uuid
    default = sql("gen_random_uuid()")
  }
  column "subject_type" {
    type = varchar(20)
    null = false
    comment = "user/group/topic"
  }
  column "subject_id" {
    type = varchar(100)
    null = false
  }
  column "fact_type" {
    type = varchar(50)
    null = false
    comment = "preference/info/event/relationship"
  }
  column "fact_key" {
    type = varchar(200)
    null = false
  }
  column "fact_value" {
    type = text
    null = false
  }
  column "confidence" {
    type = float
    default = 1.0
  }
  column "source_message_id" {
    type = varchar(100)
    null = true
  }
  column "created_at" {
    type = timestamptz
    default = sql("now()")
  }
  column "updated_at" {
    type = timestamptz
    default = sql("now()")
  }
  column "last_confirmed_at" {
    type = timestamptz
    null = true
  }
  column "version" {
    type = int
    default = 1
  }
  
  primary_key {
    columns = [column.id]
  }
  
  index "idx_fact_subject" {
    columns = [column.subject_type, column.subject_id]
  }
  
  index "idx_fact_key" {
    columns = [column.subject_id, column.fact_key]
    unique = true
  }
}

# 关系记忆表
table "relationship_memory" {
  schema = schema.public
  
  column "id" {
    type = uuid
    default = sql("gen_random_uuid()")
  }
  column "from_user_id" {
    type = varchar(100)
    null = false
  }
  column "to_user_id" {
    type = varchar(100)
    null = false
  }
  column "relationship_type" {
    type = varchar(50)
    null = false
    comment = "friend/colleague/family/other"
  }
  column "strength" {
    type = float
    default = 0.5
  }
  column "context_group_id" {
    type = varchar(100)
    null = true
  }
  column "evidence_count" {
    type = int
    default = 1
  }
  column "last_interaction_at" {
    type = timestamptz
    default = sql("now()")
  }
  column "created_at" {
    type = timestamptz
    default = sql("now()")
  }
  
  primary_key {
    columns = [column.id]
  }
  
  index "idx_relationship_users" {
    columns = [column.from_user_id, column.to_user_id]
    unique = true
  }
}

# 情感记忆表
table "emotional_memory" {
  schema = schema.public
  
  column "id" {
    type = uuid
    default = sql("gen_random_uuid()")
  }
  column "user_id" {
    type = varchar(100)
    null = false
  }
  column "chat_id" {
    type = varchar(100)
    null = false
  }
  column "emotion_type" {
    type = varchar(20)
    null = false
    comment = "positive/negative/neutral"
  }
  column "intensity" {
    type = float
    default = 0.5
  }
  column "trigger_topic" {
    type = varchar(500)
    null = true
  }
  column "message_id" {
    type = varchar(100)
    null = true
  }
  column "created_at" {
    type = timestamptz
    default = sql("now()")
  }
  
  primary_key {
    columns = [column.id]
  }
  
  index "idx_emotion_user" {
    columns = [column.user_id, column.chat_id]
  }
}

# HITL请求表
table "hitl_request" {
  schema = schema.public
  
  column "id" {
    type = uuid
    default = sql("gen_random_uuid()")
  }
  column "request_id" {
    type = varchar(100)
    null = false
    unique = true
  }
  column "agent_id" {
    type = varchar(100)
    null = false
  }
  column "chat_id" {
    type = varchar(100)
    null = false
  }
  column "user_id" {
    type = varchar(100)
    null = false
  }
  column "question" {
    type = text
    null = false
  }
  column "options" {
    type = jsonb
    null = true
  }
  column "input_type" {
    type = varchar(20)
    null = false
    comment = "text/choice/confirm"
  }
  column "timeout_seconds" {
    type = int
    default = 300
  }
  column "default_action" {
    type = varchar(100)
    null = true
  }
  column "status" {
    type = varchar(20)
    default = "pending"
    comment = "pending/responded/timeout/cancelled"
  }
  column "response" {
    type = text
    null = true
  }
  column "responded_at" {
    type = timestamptz
    null = true
  }
  column "created_at" {
    type = timestamptz
    default = sql("now()")
  }
  column "expires_at" {
    type = timestamptz
    null = false
  }
  
  primary_key {
    columns = [column.id]
  }
  
  index "idx_hitl_request_id" {
    columns = [column.request_id]
    unique = true
  }
  
  index "idx_hitl_pending" {
    columns = [column.status, column.expires_at]
  }
}
```

**ORM 模型**：

```python
# ai-service/app/orm/models.py 新增
class FactMemory(Base):
    __tablename__ = "fact_memory"
    
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    subject_type: Mapped[str] = mapped_column(String(20))
    subject_id: Mapped[str] = mapped_column(String(100))
    fact_type: Mapped[str] = mapped_column(String(50))
    fact_key: Mapped[str] = mapped_column(String(200))
    fact_value: Mapped[str] = mapped_column(Text)
    confidence: Mapped[float] = mapped_column(default=1.0)
    source_message_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=func.now())
    updated_at: Mapped[datetime] = mapped_column(default=func.now(), onupdate=func.now())
    last_confirmed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    version: Mapped[int] = mapped_column(default=1)

class RelationshipMemory(Base):
    __tablename__ = "relationship_memory"
    
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    from_user_id: Mapped[str] = mapped_column(String(100))
    to_user_id: Mapped[str] = mapped_column(String(100))
    relationship_type: Mapped[str] = mapped_column(String(50))
    strength: Mapped[float] = mapped_column(default=0.5)
    context_group_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    evidence_count: Mapped[int] = mapped_column(default=1)
    last_interaction_at: Mapped[datetime] = mapped_column(default=func.now())
    created_at: Mapped[datetime] = mapped_column(default=func.now())

class EmotionalMemory(Base):
    __tablename__ = "emotional_memory"
    
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[str] = mapped_column(String(100))
    chat_id: Mapped[str] = mapped_column(String(100))
    emotion_type: Mapped[str] = mapped_column(String(20))
    intensity: Mapped[float] = mapped_column(default=0.5)
    trigger_topic: Mapped[str | None] = mapped_column(String(500), nullable=True)
    message_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=func.now())

class HITLRequest(Base):
    __tablename__ = "hitl_request"
    
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    request_id: Mapped[str] = mapped_column(String(100), unique=True)
    agent_id: Mapped[str] = mapped_column(String(100))
    chat_id: Mapped[str] = mapped_column(String(100))
    user_id: Mapped[str] = mapped_column(String(100))
    question: Mapped[str] = mapped_column(Text)
    options: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    input_type: Mapped[str] = mapped_column(String(20))
    timeout_seconds: Mapped[int] = mapped_column(default=300)
    default_action: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    response: Mapped[str | None] = mapped_column(Text, nullable=True)
    responded_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=func.now())
    expires_at: Mapped[datetime] = mapped_column()
```

---

## 第二阶段：多层Agent架构 (Phase 2)

### P2.1 Safety Layer 实现

**文件清单**：
```
ai-service/app/agents/safety/
├── __init__.py           # 新建
├── agent.py              # 新建：安全Agent
├── filters.py            # 新建：过滤规则
└── types.py              # 新建：安全类型
```

**核心设计**：

```python
# ai-service/app/agents/safety/types.py
from enum import Enum
from pydantic import BaseModel

class SafetyAction(str, Enum):
    PASS = "pass"        # 直接通过
    WARN = "warn"        # 警告但继续
    BLOCK = "block"      # 阻止执行
    REWRITE = "rewrite"  # 重写内容

class SafetyResult(BaseModel):
    action: SafetyAction
    risk_score: float  # 0-1
    categories: list[str]  # 风险类别
    reason: str | None = None
    rewritten_content: str | None = None
```

```python
# ai-service/app/agents/safety/agent.py
from app.agents.basic.agent import ChatAgent
from .types import SafetyResult, SafetyAction

class SafetyAgent:
    def __init__(self):
        self.agent = ChatAgent(
            langfuse_prompt_name="safety-check",
            model_name="gpt-4o-mini",  # 轻量模型快速过滤
        )
        self.blocked_patterns = self._load_blocked_patterns()
    
    async def check(self, content: str, context: dict) -> SafetyResult:
        """执行安全检查"""
        # 1. 快速规则匹配
        rule_result = self._check_rules(content)
        if rule_result.action == SafetyAction.BLOCK:
            return rule_result
        
        # 2. AI检测（可选，基于风险评分）
        if rule_result.risk_score > 0.3:
            ai_result = await self._ai_check(content, context)
            return ai_result
        
        return rule_result
    
    def _check_rules(self, content: str) -> SafetyResult:
        """基于规则的快速检查"""
        # 敏感词匹配、正则规则等
        ...
    
    async def _ai_check(self, content: str, context: dict) -> SafetyResult:
        """AI模型检查"""
        response = await self.agent.run(
            input=f"请分析以下内容的安全性: {content}",
            context=context,
        )
        return self._parse_ai_response(response)
```

---

### P2.2 Intent Layer 实现

**文件清单**：
```
ai-service/app/agents/intent/
├── __init__.py           # 新建
├── agent.py              # 新建：意图识别Agent
├── router.py             # 新建：路由决策
└── types.py              # 新建：意图类型
```

**核心设计**：

```python
# ai-service/app/agents/intent/types.py
from enum import Enum
from pydantic import BaseModel
from typing import Any

class IntentType(str, Enum):
    CHAT = "chat"           # 闲聊
    SEARCH = "search"       # 搜索信息
    CREATE = "create"       # 创建内容
    QUERY = "query"         # 查询数据
    TASK = "task"           # 执行任务
    MEMORY = "memory"       # 记忆操作
    UNKNOWN = "unknown"

class Intent(BaseModel):
    type: IntentType
    confidence: float
    entities: dict[str, Any] = {}  # 提取的实体
    slots: dict[str, Any] = {}     # 填充的槽位
    suggested_tools: list[str] = []
    context_requirements: list[str] = []  # 需要的上下文类型
```

```python
# ai-service/app/agents/intent/agent.py
from app.agents.basic.agent import ChatAgent
from .types import Intent, IntentType

class IntentAgent:
    def __init__(self):
        self.agent = ChatAgent(
            langfuse_prompt_name="intent-recognition",
            model_name="gpt-4o-mini",
        )
        self.tools = [
            self._classify_intent,
            self._extract_entities,
            self._suggest_context,
        ]
    
    async def recognize(self, message: str, history: list, multimodal_ctx) -> Intent:
        """识别用户意图"""
        response = await self.agent.run(
            input=message,
            history=history,
            multimodal_context=multimodal_ctx.to_text_context() if multimodal_ctx else None,
        )
        return self._parse_intent(response)
    
    def _parse_intent(self, response: str) -> Intent:
        """解析AI响应为Intent对象"""
        # 实现JSON解析逻辑
        ...
```

```python
# ai-service/app/agents/intent/router.py
from .types import Intent, IntentType
from typing import Type
from app.agents.basic.agent import ChatAgent

class AgentRouter:
    def __init__(self):
        self.expert_agents: dict[IntentType, Type[ChatAgent]] = {}
    
    def register_expert(self, intent_type: IntentType, agent_class: Type[ChatAgent]):
        self.expert_agents[intent_type] = agent_class
    
    def route(self, intent: Intent) -> ChatAgent:
        """根据意图路由到合适的专家Agent"""
        agent_class = self.expert_agents.get(intent.type)
        if not agent_class:
            # 默认回退到通用Agent
            from app.agents.main.agent import MainAgent
            agent_class = MainAgent
        return agent_class()
```

---

### P2.3 专家Agent实现

**文件清单**：
```
ai-service/app/agents/experts/
├── __init__.py           # 新建
├── base.py               # 新建：专家Agent基类
├── chat_expert.py        # 新建：闲聊专家
├── search_expert.py      # 新建：搜索专家
├── task_expert.py        # 新建：任务专家
└── creative_expert.py    # 新建：创作专家
```

**核心设计**：

```python
# ai-service/app/agents/experts/base.py
from abc import ABC, abstractmethod
from app.agents.basic.agent import ChatAgent
from app.agents.intent.types import Intent
from app.types.multimodal import MultiModalContext

class ExpertAgent(ChatAgent, ABC):
    expert_type: str
    capabilities: list[str]
    
    @abstractmethod
    async def can_handle(self, intent: Intent) -> float:
        """返回处理该意图的置信度 (0-1)"""
        pass
    
    async def handoff(self, target_expert: str, context: dict):
        """移交给其他专家Agent"""
        from .router import AgentRouter
        router = AgentRouter.get_instance()
        target = router.get_expert(target_expert)
        if target:
            return await target.run(**context)
        raise ValueError(f"Unknown expert: {target_expert}")
    
    async def process(
        self,
        intent: Intent,
        messages: list,
        multimodal_ctx: MultiModalContext | None = None,
    ):
        """处理请求"""
        # 子类实现具体处理逻辑
        pass
```

```python
# ai-service/app/agents/experts/search_expert.py
from .base import ExpertAgent
from app.agents.intent.types import Intent, IntentType
from app.agents.tools.registry import ToolRegistry
from app.agents.tools.types import ToolCategory

class SearchExpert(ExpertAgent):
    expert_type = "search"
    capabilities = [
        "web_search", "image_search", "knowledge_search",
        "bangumi_search", "history_search"
    ]
    
    def __init__(self):
        super().__init__(
            langfuse_prompt_name="search-expert",
            model_name="grok-4-fast-reasoning",
        )
        # 动态加载搜索类工具
        registry = ToolRegistry.get_instance()
        self.tools = registry.get_tools_by_category(ToolCategory.SEARCH)
    
    async def can_handle(self, intent: Intent) -> float:
        if intent.type == IntentType.SEARCH:
            return 0.9
        if "搜索" in str(intent.entities) or "查找" in str(intent.entities):
            return 0.7
        return 0.1
```

---

### P2.4 Response Layer 实现

**文件清单**：
```
ai-service/app/agents/response/
├── __init__.py           # 新建
├── agent.py              # 新建：响应处理Agent
├── formatter.py          # 新建：格式化器
└── memory_trigger.py     # 新建：记忆更新触发器
```

**核心设计**：

```python
# ai-service/app/agents/response/agent.py
from app.agents.safety.agent import SafetyAgent
from .formatter import ResponseFormatter
from .memory_trigger import MemoryTrigger

class ResponseAgent:
    def __init__(self):
        self.safety = SafetyAgent()
        self.formatter = ResponseFormatter()
        self.memory_trigger = MemoryTrigger()
    
    async def process(
        self,
        raw_response: str,
        intent: Intent,
        context: dict,
    ) -> str:
        """处理并输出最终响应"""
        # 1. 输出安全检查
        safety_result = await self.safety.check(raw_response, context)
        if safety_result.action == SafetyAction.BLOCK:
            return "抱歉，我无法生成该内容。"
        if safety_result.action == SafetyAction.REWRITE:
            raw_response = safety_result.rewritten_content
        
        # 2. 格式化响应
        formatted = await self.formatter.format(raw_response, intent)
        
        # 3. 触发记忆更新
        await self.memory_trigger.trigger(context, raw_response, intent)
        
        return formatted
```

---

## 第三阶段：记忆系统深度重构 (Phase 3)

### P3.1 Memory Orchestrator 实现

**文件清单**：
```
ai-service/app/memory/
├── orchestrator.py       # 新建：记忆编排器
├── l1_working.py         # 新建：工作记忆(Redis)
├── l2_episodic.py        # 重构：情景记忆
├── l3_semantic.py        # 新建：语义记忆
├── fact_memory.py        # 新建：事实记忆服务
├── relationship_memory.py # 新建：关系记忆服务
├── emotional_memory.py   # 新建：情感记忆服务
└── types.py              # 新建：记忆类型定义
```

**核心设计**：

```python
# ai-service/app/memory/types.py
from enum import Enum
from pydantic import BaseModel
from typing import Any
from datetime import datetime

class MemoryLevel(str, Enum):
    L1_WORKING = "l1"    # 工作记忆 (Redis, 毫秒级)
    L2_EPISODIC = "l2"   # 情景记忆 (PostgreSQL, 秒级)
    L3_SEMANTIC = "l3"   # 语义记忆 (Qdrant, 向量检索)

class MemoryQuery(BaseModel):
    user_id: str | None = None
    chat_id: str | None = None
    query_text: str | None = None
    time_range: tuple[datetime, datetime] | None = None
    levels: list[MemoryLevel] = [MemoryLevel.L1_WORKING, MemoryLevel.L2_EPISODIC]
    limit: int = 10

class MemoryResult(BaseModel):
    level: MemoryLevel
    content: Any
    relevance_score: float
    source: str
    timestamp: datetime
```

```python
# ai-service/app/memory/orchestrator.py
from .types import MemoryQuery, MemoryResult, MemoryLevel
from .l1_working import WorkingMemory
from .l2_episodic import EpisodicMemory
from .l3_semantic import SemanticMemory
from .fact_memory import FactMemoryService
from .relationship_memory import RelationshipMemoryService

class MemoryOrchestrator:
    """统一记忆访问接口"""
    
    def __init__(self):
        self.l1 = WorkingMemory()
        self.l2 = EpisodicMemory()
        self.l3 = SemanticMemory()
        self.facts = FactMemoryService()
        self.relationships = RelationshipMemoryService()
    
    async def retrieve(self, query: MemoryQuery) -> list[MemoryResult]:
        """智能检索记忆"""
        results = []
        
        # 并行查询多个记忆层
        tasks = []
        if MemoryLevel.L1_WORKING in query.levels:
            tasks.append(self.l1.retrieve(query))
        if MemoryLevel.L2_EPISODIC in query.levels:
            tasks.append(self.l2.retrieve(query))
        if MemoryLevel.L3_SEMANTIC in query.levels:
            tasks.append(self.l3.retrieve(query))
        
        # 并行执行
        import asyncio
        layer_results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for layer_result in layer_results:
            if isinstance(layer_result, list):
                results.extend(layer_result)
        
        # 按相关性排序
        results.sort(key=lambda x: x.relevance_score, reverse=True)
        return results[:query.limit]
    
    async def store(self, memory_type: str, data: dict) -> bool:
        """存储记忆"""
        if memory_type == "fact":
            return await self.facts.store(**data)
        elif memory_type == "relationship":
            return await self.relationships.store(**data)
        # ... 其他类型
    
    async def get_context_for_chat(
        self,
        user_id: str,
        chat_id: str,
        current_message: str,
    ) -> dict:
        """为对话构建完整上下文"""
        # L1: 当前会话上下文
        working_ctx = await self.l1.get_session_context(chat_id)
        
        # L2: 相关历史对话
        episodic_ctx = await self.l2.get_relevant_episodes(
            chat_id=chat_id,
            query=current_message,
            limit=5,
        )
        
        # L3: 语义相关记忆
        semantic_ctx = await self.l3.search(
            query=current_message,
            filters={"chat_id": chat_id},
            limit=3,
        )
        
        # 事实记忆
        user_facts = await self.facts.get_facts(
            subject_type="user",
            subject_id=user_id,
        )
        group_facts = await self.facts.get_facts(
            subject_type="group",
            subject_id=chat_id,
        )
        
        # 关系记忆
        relationships = await self.relationships.get_user_relationships(user_id)
        
        return {
            "working": working_ctx,
            "episodic": episodic_ctx,
            "semantic": semantic_ctx,
            "user_facts": user_facts,
            "group_facts": group_facts,
            "relationships": relationships,
        }
```

```python
# ai-service/app/memory/l1_working.py
from app.infrastructure.redis import redis_client
import json

class WorkingMemory:
    """L1工作记忆 - Redis实现"""
    
    KEY_PREFIX = "working_memory:"
    TTL_SECONDS = 3600  # 1小时过期
    
    async def get_session_context(self, chat_id: str) -> dict:
        """获取会话上下文"""
        key = f"{self.KEY_PREFIX}session:{chat_id}"
        data = await redis_client.get(key)
        return json.loads(data) if data else {}
    
    async def update_session_context(self, chat_id: str, context: dict):
        """更新会话上下文"""
        key = f"{self.KEY_PREFIX}session:{chat_id}"
        await redis_client.setex(key, self.TTL_SECONDS, json.dumps(context))
    
    async def append_message(self, chat_id: str, message: dict):
        """追加消息到工作记忆"""
        key = f"{self.KEY_PREFIX}messages:{chat_id}"
        await redis_client.lpush(key, json.dumps(message))
        await redis_client.ltrim(key, 0, 49)  # 保留最近50条
        await redis_client.expire(key, self.TTL_SECONDS)
```

```python
# ai-service/app/memory/fact_memory.py
from sqlalchemy import select, and_
from app.orm.models import FactMemory
from app.orm.session import get_session

class FactMemoryService:
    """事实记忆服务"""
    
    async def store(
        self,
        subject_type: str,
        subject_id: str,
        fact_type: str,
        fact_key: str,
        fact_value: str,
        confidence: float = 1.0,
        source_message_id: str | None = None,
    ) -> bool:
        """存储或更新事实"""
        async with get_session() as session:
            # 查找是否存在
            stmt = select(FactMemory).where(
                and_(
                    FactMemory.subject_id == subject_id,
                    FactMemory.fact_key == fact_key,
                )
            )
            result = await session.execute(stmt)
            existing = result.scalar_one_or_none()
            
            if existing:
                # 更新现有事实
                existing.fact_value = fact_value
                existing.confidence = confidence
                existing.version += 1
                existing.last_confirmed_at = func.now()
            else:
                # 创建新事实
                fact = FactMemory(
                    subject_type=subject_type,
                    subject_id=subject_id,
                    fact_type=fact_type,
                    fact_key=fact_key,
                    fact_value=fact_value,
                    confidence=confidence,
                    source_message_id=source_message_id,
                )
                session.add(fact)
            
            await session.commit()
            return True
    
    async def get_facts(
        self,
        subject_type: str,
        subject_id: str,
        fact_type: str | None = None,
        min_confidence: float = 0.5,
    ) -> list[dict]:
        """获取事实列表"""
        async with get_session() as session:
            conditions = [
                FactMemory.subject_type == subject_type,
                FactMemory.subject_id == subject_id,
                FactMemory.confidence >= min_confidence,
            ]
            if fact_type:
                conditions.append(FactMemory.fact_type == fact_type)
            
            stmt = select(FactMemory).where(and_(*conditions))
            result = await session.execute(stmt)
            facts = result.scalars().all()
            
            return [
                {
                    "key": f.fact_key,
                    "value": f.fact_value,
                    "type": f.fact_type,
                    "confidence": f.confidence,
                }
                for f in facts
            ]
    
    async def decay_confidence(self, days_old: int = 30, decay_rate: float = 0.1):
        """衰减老旧事实的置信度"""
        # 用于定时任务，衰减长期未确认的事实
        ...
```

---

### P3.2 记忆工具集扩展

**文件清单**：
```
ai-service/app/agents/memory/
├── tools.py              # 修改：扩展工具
├── fact_tools.py         # 新建：事实记忆工具
├── relation_tools.py     # 新建：关系记忆工具
└── emotion_tools.py      # 新建：情感记忆工具
```

**核心设计**：

```python
# ai-service/app/agents/memory/fact_tools.py
from app.agents.tools.decorators import register_tool
from app.agents.tools.types import ToolCategory
from app.memory.fact_memory import FactMemoryService

fact_service = FactMemoryService()

@register_tool(
    category=ToolCategory.MEMORY,
    tags=["memory", "fact"]
)
async def store_fact(
    subject_type: str,
    subject_id: str,
    fact_key: str,
    fact_value: str,
    fact_type: str = "info",
    confidence: float = 1.0,
) -> str:
    """存储一个事实到长期记忆中。
    
    Args:
        subject_type: 主体类型，如 "user", "group", "topic"
        subject_id: 主体ID
        fact_key: 事实的键，如 "favorite_anime", "birthday"
        fact_value: 事实的值
        fact_type: 事实类型，如 "preference", "info", "event"
        confidence: 置信度 0-1
    
    Returns:
        成功或失败的消息
    """
    success = await fact_service.store(
        subject_type=subject_type,
        subject_id=subject_id,
        fact_type=fact_type,
        fact_key=fact_key,
        fact_value=fact_value,
        confidence=confidence,
    )
    return "事实已存储" if success else "存储失败"

@register_tool(
    category=ToolCategory.MEMORY,
    tags=["memory", "fact"]
)
async def query_facts(
    subject_type: str,
    subject_id: str,
    fact_type: str | None = None,
) -> list[dict]:
    """查询主体的所有事实记忆。
    
    Args:
        subject_type: 主体类型
        subject_id: 主体ID
        fact_type: 可选的事实类型过滤
    
    Returns:
        事实列表
    """
    return await fact_service.get_facts(
        subject_type=subject_type,
        subject_id=subject_id,
        fact_type=fact_type,
    )

@register_tool(
    category=ToolCategory.MEMORY,
    tags=["memory", "fact"]
)
async def forget_fact(
    subject_id: str,
    fact_key: str,
    reason: str = "",
) -> str:
    """降低一个事实的置信度（软删除）。
    
    Args:
        subject_id: 主体ID
        fact_key: 要遗忘的事实键
        reason: 遗忘原因
    
    Returns:
        操作结果
    """
    # 将置信度降到0.1以下，实际上是软删除
    success = await fact_service.update_confidence(
        subject_id=subject_id,
        fact_key=fact_key,
        new_confidence=0.05,
    )
    return "已遗忘该事实" if success else "操作失败"
```

```python
# ai-service/app/agents/memory/relation_tools.py
from app.agents.tools.decorators import register_tool
from app.agents.tools.types import ToolCategory
from app.memory.relationship_memory import RelationshipMemoryService

relation_service = RelationshipMemoryService()

@register_tool(
    category=ToolCategory.MEMORY,
    tags=["memory", "relationship"]
)
async def link_users(
    from_user_id: str,
    to_user_id: str,
    relationship_type: str,
    context_group_id: str | None = None,
) -> str:
    """建立或更新两个用户之间的关系。
    
    Args:
        from_user_id: 源用户ID
        to_user_id: 目标用户ID
        relationship_type: 关系类型，如 "friend", "colleague", "family"
        context_group_id: 发现该关系的群组ID
    
    Returns:
        操作结果
    """
    success = await relation_service.create_or_update(
        from_user_id=from_user_id,
        to_user_id=to_user_id,
        relationship_type=relationship_type,
        context_group_id=context_group_id,
    )
    return "关系已建立" if success else "操作失败"

@register_tool(
    category=ToolCategory.MEMORY,
    tags=["memory", "relationship"]
)
async def query_relations(
    user_id: str,
    relationship_type: str | None = None,
) -> list[dict]:
    """查询用户的社交关系。
    
    Args:
        user_id: 用户ID
        relationship_type: 可选的关系类型过滤
    
    Returns:
        关系列表
    """
    return await relation_service.get_user_relationships(
        user_id=user_id,
        relationship_type=relationship_type,
    )
```

---

## 第四阶段：工具扩展 (Phase 4)

### P4.1 多媒体工具

**文件清单**：
```
ai-service/app/agents/media/
├── __init__.py           # 新建
├── tools.py              # 新建：多媒体工具集
├── image_search.py       # 新建：以图搜图
└── image_edit.py         # 新建：图片编辑
```

**核心设计**：

```python
# ai-service/app/agents/media/tools.py
from app.agents.tools.decorators import register_tool
from app.agents.tools.types import ToolCategory
from app.services.vision_service import vision_service
import httpx

@register_tool(
    category=ToolCategory.MEDIA,
    requires_multimodal=True,
    timeout=60,
    tags=["image", "search"]
)
async def search_similar_images(
    image_url: str,
    limit: int = 5,
) -> list[dict]:
    """以图搜图，找到相似的图片。
    
    Args:
        image_url: 源图片URL
        limit: 返回结果数量
    
    Returns:
        相似图片列表
    """
    # 使用外部API（如Google Lens API或其他）
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.example.com/reverse-image-search",
            json={"image_url": image_url, "limit": limit},
        )
        return response.json()

@register_tool(
    category=ToolCategory.MEDIA,
    requires_multimodal=True,
    timeout=30,
    tags=["image", "analyze"]
)
async def analyze_image(
    image_url: str,
    analysis_type: str = "general",
) -> dict:
    """分析图片内容。
    
    Args:
        image_url: 图片URL
        analysis_type: 分析类型 - general/ocr/face/object
    
    Returns:
        分析结果
    """
    description = await vision_service.analyze_image(image_url)
    return {
        "description": description,
        "type": analysis_type,
    }

@register_tool(
    category=ToolCategory.MEDIA,
    timeout=120,
    tags=["image", "edit"]
)
async def edit_image(
    image_url: str,
    edit_instruction: str,
) -> str:
    """编辑图片。
    
    Args:
        image_url: 源图片URL
        edit_instruction: 编辑指令，如 "移除背景", "调亮"
    
    Returns:
        编辑后的图片URL
    """
    # 使用图片编辑API
    ...
```

---

### P4.2 计算工具

**文件清单**：
```
ai-service/app/agents/compute/
├── __init__.py           # 新建
├── tools.py              # 新建：计算工具集
├── calculator.py         # 新建：数学计算
├── converter.py          # 新建：单位转换
└── code_executor.py      # 新建：代码执行(沙箱)
```

**核心设计**：

```python
# ai-service/app/agents/compute/tools.py
from app.agents.tools.decorators import register_tool
from app.agents.tools.types import ToolCategory
import ast
import operator

@register_tool(
    category=ToolCategory.COMPUTE,
    tags=["math", "calculate"]
)
async def calculate(expression: str) -> str:
    """安全地计算数学表达式。
    
    Args:
        expression: 数学表达式，如 "2 + 3 * 4", "sqrt(16)"
    
    Returns:
        计算结果
    """
    # 使用安全的表达式求值
    allowed_names = {
        "abs": abs, "round": round, "min": min, "max": max,
        "sum": sum, "pow": pow, "sqrt": lambda x: x ** 0.5,
    }
    try:
        result = eval(expression, {"__builtins__": {}}, allowed_names)
        return str(result)
    except Exception as e:
        return f"计算错误: {e}"

@register_tool(
    category=ToolCategory.COMPUTE,
    tags=["convert", "unit"]
)
async def convert_unit(
    value: float,
    from_unit: str,
    to_unit: str,
) -> str:
    """单位转换。
    
    Args:
        value: 数值
        from_unit: 源单位
        to_unit: 目标单位
    
    Returns:
        转换结果
    """
    # 单位转换表
    conversions = {
        ("km", "m"): 1000,
        ("m", "cm"): 100,
        ("kg", "g"): 1000,
        ("celsius", "fahrenheit"): lambda c: c * 9/5 + 32,
        # ... 更多转换
    }
    
    key = (from_unit.lower(), to_unit.lower())
    if key in conversions:
        factor = conversions[key]
        if callable(factor):
            result = factor(value)
        else:
            result = value * factor
        return f"{value} {from_unit} = {result} {to_unit}"
    return f"不支持的单位转换: {from_unit} -> {to_unit}"

@register_tool(
    category=ToolCategory.COMPUTE,
    tags=["time", "calculate"]
)
async def calculate_time(
    operation: str,
    datetime1: str,
    datetime2: str | None = None,
    offset: str | None = None,
) -> str:
    """时间计算。
    
    Args:
        operation: 操作类型 - diff/add/subtract
        datetime1: 第一个日期时间
        datetime2: 第二个日期时间（用于diff）
        offset: 时间偏移（用于add/subtract），如 "2 days", "3 hours"
    
    Returns:
        计算结果
    """
    from datetime import datetime, timedelta
    import re
    
    dt1 = datetime.fromisoformat(datetime1)
    
    if operation == "diff" and datetime2:
        dt2 = datetime.fromisoformat(datetime2)
        diff = abs(dt2 - dt1)
        return f"时间差: {diff}"
    
    if operation in ("add", "subtract") and offset:
        # 解析偏移量，如 "2 days"
        match = re.match(r"(\d+)\s*(\w+)", offset)
        if match:
            amount = int(match.group(1))
            unit = match.group(2).lower()
            delta_kwargs = {unit: amount}
            delta = timedelta(**delta_kwargs)
            if operation == "subtract":
                delta = -delta
            result = dt1 + delta
            return f"结果: {result.isoformat()}"
    
    return "无效的操作"
```

---

### P4.3 外部集成工具

**文件清单**：
```
ai-service/app/agents/external/
├── __init__.py           # 新建
├── tools.py              # 新建：外部工具集
├── weather.py            # 新建：天气查询
├── news.py               # 新建：新闻聚合
└── calendar.py           # 新建：日历操作
```

**核心设计**：

```python
# ai-service/app/agents/external/weather.py
from app.agents.tools.decorators import register_tool
from app.agents.tools.types import ToolCategory
import httpx

@register_tool(
    category=ToolCategory.EXTERNAL,
    rate_limit=30,
    tags=["weather", "query"]
)
async def get_weather(
    location: str,
    days: int = 1,
) -> dict:
    """查询天气信息。
    
    Args:
        location: 地点名称，如 "北京", "Shanghai"
        days: 预报天数 (1-7)
    
    Returns:
        天气信息
    """
    # 使用天气API
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"https://api.weatherapi.com/v1/forecast.json",
            params={
                "key": settings.weather_api_key,
                "q": location,
                "days": days,
                "lang": "zh",
            },
        )
        data = response.json()
        return {
            "location": data["location"]["name"],
            "current": {
                "temp_c": data["current"]["temp_c"],
                "condition": data["current"]["condition"]["text"],
                "humidity": data["current"]["humidity"],
            },
            "forecast": [
                {
                    "date": day["date"],
                    "max_temp": day["day"]["maxtemp_c"],
                    "min_temp": day["day"]["mintemp_c"],
                    "condition": day["day"]["condition"]["text"],
                }
                for day in data["forecast"]["forecastday"]
            ],
        }
```

---

### P4.4 交互工具

**文件清单**：
```
ai-service/app/agents/interaction/
├── __init__.py           # 新建
├── tools.py              # 新建：交互工具集
├── message.py            # 新建：消息发送
├── card.py               # 新建：卡片创建
└── poll.py               # 新建：投票创建
```

**核心设计**：

```python
# ai-service/app/agents/interaction/tools.py
from app.agents.tools.decorators import register_tool
from app.agents.tools.types import ToolCategory
from app.clients.lark_client import lark_client

@register_tool(
    category=ToolCategory.INTERACTION,
    requires_auth=True,
    tags=["message", "send"]
)
async def send_message(
    chat_id: str,
    content: str,
    msg_type: str = "text",
) -> str:
    """发送消息到群组。
    
    Args:
        chat_id: 群组ID
        content: 消息内容
        msg_type: 消息类型 - text/markdown/image
    
    Returns:
        发送结果
    """
    result = await lark_client.send_message(
        chat_id=chat_id,
        content=content,
        msg_type=msg_type,
    )
    return "消息已发送" if result else "发送失败"

@register_tool(
    category=ToolCategory.INTERACTION,
    requires_auth=True,
    tags=["card", "create"]
)
async def create_interactive_card(
    chat_id: str,
    title: str,
    content: str,
    buttons: list[dict] | None = None,
) -> str:
    """创建交互式卡片。
    
    Args:
        chat_id: 群组ID
        title: 卡片标题
        content: 卡片内容
        buttons: 按钮列表，每个按钮包含 text 和 action
    
    Returns:
        卡片创建结果
    """
    card_template = {
        "header": {"title": {"tag": "plain_text", "content": title}},
        "elements": [
            {"tag": "div", "text": {"tag": "lark_md", "content": content}},
        ],
    }
    
    if buttons:
        action_elements = []
        for btn in buttons:
            action_elements.append({
                "tag": "button",
                "text": {"tag": "plain_text", "content": btn["text"]},
                "value": btn.get("action", btn["text"]),
            })
        card_template["elements"].append({
            "tag": "action",
            "actions": action_elements,
        })
    
    result = await lark_client.send_card(chat_id, card_template)
    return "卡片已创建" if result else "创建失败"

@register_tool(
    category=ToolCategory.INTERACTION,
    requires_auth=True,
    tags=["poll", "create"]
)
async def create_poll(
    chat_id: str,
    question: str,
    options: list[str],
    anonymous: bool = False,
    multi_select: bool = False,
) -> str:
    """创建投票。
    
    Args:
        chat_id: 群组ID
        question: 投票问题
        options: 选项列表
        anonymous: 是否匿名投票
        multi_select: 是否允许多选
    
    Returns:
        投票创建结果
    """
    # 飞书投票API
    ...
```

---

## 第五阶段：异步交互机制 (Phase 5)

### P5.1 Human in the Loop

**文件清单**：
```
ai-service/app/hitl/
├── __init__.py           # 新建
├── service.py            # 新建：HITL服务
├── types.py              # 新建：HITL类型
└── handlers.py           # 新建：响应处理器

ai-service/app/api/
├── hitl.py               # 新建：HITL API端点
```

**核心设计**：

```python
# ai-service/app/hitl/types.py
from pydantic import BaseModel
from datetime import datetime
from enum import Enum

class HITLInputType(str, Enum):
    TEXT = "text"
    CHOICE = "choice"
    CONFIRM = "confirm"

class HITLStatus(str, Enum):
    PENDING = "pending"
    RESPONDED = "responded"
    TIMEOUT = "timeout"
    CANCELLED = "cancelled"

class HITLRequest(BaseModel):
    request_id: str
    agent_id: str
    chat_id: str
    user_id: str
    question: str
    options: list[str] | None = None
    input_type: HITLInputType
    timeout_seconds: int = 300
    default_action: str | None = None

class HITLResponse(BaseModel):
    request_id: str
    user_response: str
    timestamp: datetime
```

```python
# ai-service/app/hitl/service.py
from .types import HITLRequest, HITLResponse, HITLStatus
from app.orm.models import HITLRequest as HITLRequestModel
from app.orm.session import get_session
from datetime import datetime, timedelta
import asyncio
import uuid

class HITLService:
    """Human in the Loop 服务"""
    
    def __init__(self):
        self._pending_requests: dict[str, asyncio.Event] = {}
    
    async def request_input(
        self,
        chat_id: str,
        user_id: str,
        question: str,
        options: list[str] | None = None,
        input_type: str = "text",
        timeout_seconds: int = 300,
        default_action: str | None = None,
    ) -> str:
        """请求用户输入，阻塞直到收到响应或超时"""
        request_id = str(uuid.uuid4())
        
        # 创建等待事件
        event = asyncio.Event()
        self._pending_requests[request_id] = event
        
        # 存储请求到数据库
        async with get_session() as session:
            hitl_request = HITLRequestModel(
                request_id=request_id,
                agent_id="main",
                chat_id=chat_id,
                user_id=user_id,
                question=question,
                options=options,
                input_type=input_type,
                timeout_seconds=timeout_seconds,
                default_action=default_action,
                status="pending",
                expires_at=datetime.now() + timedelta(seconds=timeout_seconds),
            )
            session.add(hitl_request)
            await session.commit()
        
        # 发送确认卡片到用户
        await self._send_confirmation_card(chat_id, request_id, question, options)
        
        # 等待响应
        try:
            await asyncio.wait_for(event.wait(), timeout=timeout_seconds)
            # 获取响应
            response = await self._get_response(request_id)
            return response
        except asyncio.TimeoutError:
            # 超时处理
            await self._handle_timeout(request_id, default_action)
            return default_action or ""
        finally:
            del self._pending_requests[request_id]
    
    async def handle_response(self, request_id: str, response: str):
        """处理用户响应"""
        async with get_session() as session:
            # 更新数据库
            from sqlalchemy import update
            stmt = update(HITLRequestModel).where(
                HITLRequestModel.request_id == request_id
            ).values(
                status="responded",
                response=response,
                responded_at=datetime.now(),
            )
            await session.execute(stmt)
            await session.commit()
        
        # 唤醒等待的协程
        if request_id in self._pending_requests:
            self._pending_requests[request_id].set()
    
    async def _send_confirmation_card(
        self,
        chat_id: str,
        request_id: str,
        question: str,
        options: list[str] | None,
    ):
        """发送确认卡片到飞书"""
        from app.clients.lark_client import lark_client
        
        card = {
            "header": {"title": {"tag": "plain_text", "content": "需要您的确认"}},
            "elements": [
                {"tag": "div", "text": {"tag": "lark_md", "content": question}},
            ],
        }
        
        if options:
            # 添加选项按钮
            actions = []
            for opt in options:
                actions.append({
                    "tag": "button",
                    "text": {"tag": "plain_text", "content": opt},
                    "value": {"request_id": request_id, "response": opt},
                    "type": "primary" if opt == options[0] else "default",
                })
            card["elements"].append({"tag": "action", "actions": actions})
        
        await lark_client.send_card(chat_id, card)

hitl_service = HITLService()
```

```python
# ai-service/app/api/hitl.py
from fastapi import APIRouter, HTTPException
from app.hitl.service import hitl_service
from pydantic import BaseModel

router = APIRouter(prefix="/hitl", tags=["hitl"])

class HITLResponsePayload(BaseModel):
    request_id: str
    response: str

@router.post("/respond")
async def respond_to_hitl(payload: HITLResponsePayload):
    """用户响应HITL请求"""
    await hitl_service.handle_response(
        request_id=payload.request_id,
        response=payload.response,
    )
    return {"status": "ok"}
```

---

### P5.2 HITL工具集成

**文件清单**：
```
ai-service/app/agents/interaction/
├── hitl_tools.py         # 新建：HITL工具
```

**核心设计**：

```python
# ai-service/app/agents/interaction/hitl_tools.py
from app.agents.tools.decorators import register_tool
from app.agents.tools.types import ToolCategory
from app.hitl.service import hitl_service

@register_tool(
    category=ToolCategory.INTERACTION,
    requires_auth=True,
    timeout=600,  # 10分钟超时
    tags=["hitl", "confirm"]
)
async def request_user_confirmation(
    chat_id: str,
    user_id: str,
    question: str,
    options: list[str] | None = None,
    timeout_seconds: int = 300,
) -> str:
    """请求用户确认。此操作会暂停Agent执行，等待用户响应。
    
    Args:
        chat_id: 群组ID
        user_id: 用户ID
        question: 要询问的问题
        options: 可选的选项列表
        timeout_seconds: 超时秒数
    
    Returns:
        用户的响应
    """
    response = await hitl_service.request_input(
        chat_id=chat_id,
        user_id=user_id,
        question=question,
        options=options,
        input_type="choice" if options else "text",
        timeout_seconds=timeout_seconds,
    )
    return response

@register_tool(
    category=ToolCategory.INTERACTION,
    requires_auth=True,
    timeout=600,
    tags=["hitl", "input"]
)
async def request_user_input(
    chat_id: str,
    user_id: str,
    prompt: str,
    timeout_seconds: int = 300,
    default_value: str = "",
) -> str:
    """请求用户输入文本。此操作会暂停Agent执行，等待用户输入。
    
    Args:
        chat_id: 群组ID
        user_id: 用户ID
        prompt: 提示信息
        timeout_seconds: 超时秒数
        default_value: 超时时的默认值
    
    Returns:
        用户输入的文本
    """
    response = await hitl_service.request_input(
        chat_id=chat_id,
        user_id=user_id,
        question=prompt,
        input_type="text",
        timeout_seconds=timeout_seconds,
        default_action=default_value,
    )
    return response
```

---

## 第六阶段：集成与测试 (Phase 6)

### P6.1 主Agent流程重构

**文件修改**：
```
ai-service/app/agents/main/
├── agent.py              # 重大修改：集成多层架构
```

**核心变更**：

```python
# ai-service/app/agents/main/agent.py 重构后
from app.agents.safety.agent import SafetyAgent
from app.agents.intent.agent import IntentAgent
from app.agents.intent.router import AgentRouter
from app.agents.response.agent import ResponseAgent
from app.memory.orchestrator import MemoryOrchestrator
from app.types.multimodal import MultiModalContext

class MainAgentOrchestrator:
    """主Agent编排器 - 多层架构入口"""
    
    def __init__(self):
        self.safety = SafetyAgent()
        self.intent = IntentAgent()
        self.router = AgentRouter()
        self.response = ResponseAgent()
        self.memory = MemoryOrchestrator()
    
    async def stream_chat(
        self,
        request: ChatRequest,
        image_client: ImageProcessClient,
    ) -> AsyncGenerator[str, None]:
        """主入口：流式对话处理"""
        
        # 1. 构建上下文
        messages, multimodal_ctx = await build_context(
            request, image_client, enrich_images=True
        )
        
        # 2. 安全检查
        user_message = request.text
        safety_result = await self.safety.check(
            content=user_message,
            context={"chat_id": request.chat_id, "user_id": request.user_id},
        )
        
        if safety_result.action == SafetyAction.BLOCK:
            yield "抱歉，我无法处理该请求。"
            return
        
        if safety_result.action == SafetyAction.REWRITE:
            user_message = safety_result.rewritten_content
        
        # 3. 意图识别
        intent = await self.intent.recognize(
            message=user_message,
            history=messages,
            multimodal_ctx=multimodal_ctx,
        )
        
        # 4. 获取记忆上下文
        memory_ctx = await self.memory.get_context_for_chat(
            user_id=request.user_id,
            chat_id=request.chat_id,
            current_message=user_message,
        )
        
        # 5. 路由到专家Agent
        expert = self.router.route(intent)
        
        # 6. 执行并流式输出
        async for chunk in expert.stream(
            messages=messages,
            intent=intent,
            memory_context=memory_ctx,
            multimodal_context=multimodal_ctx,
        ):
            yield chunk
        
        # 7. 响应后处理（触发记忆更新等）
        await self.response.post_process(
            intent=intent,
            context={
                "user_id": request.user_id,
                "chat_id": request.chat_id,
                "message": user_message,
            },
        )
```

---

### P6.2 API端点更新

**文件修改**：
```
ai-service/app/api/chat.py    # 修改：使用新编排器
ai-service/app/main.py        # 修改：注册新路由
```

---

### P6.3 工具自动发现与注册

**文件新建**：
```
ai-service/app/agents/tools/discovery.py  # 新建：工具自动发现
```

**核心设计**：

```python
# ai-service/app/agents/tools/discovery.py
import importlib
import pkgutil
from pathlib import Path

def discover_and_register_tools():
    """自动发现并注册所有工具"""
    tool_packages = [
        "app.agents.search.tools",
        "app.agents.history",
        "app.agents.memory",
        "app.agents.media",
        "app.agents.compute",
        "app.agents.external",
        "app.agents.interaction",
    ]
    
    for package_name in tool_packages:
        try:
            package = importlib.import_module(package_name)
            package_path = Path(package.__file__).parent
            
            for _, module_name, _ in pkgutil.iter_modules([str(package_path)]):
                full_module_name = f"{package_name}.{module_name}"
                importlib.import_module(full_module_name)
        except ImportError as e:
            print(f"Failed to import {package_name}: {e}")
    
    from .registry import ToolRegistry
    registry = ToolRegistry.get_instance()
    print(f"Registered {len(registry._tools)} tools")
```

---

### P6.4 测试套件

**文件新建**：
```
ai-service/tests/
├── agents/
│   ├── test_safety_agent.py
│   ├── test_intent_agent.py
│   └── test_expert_agents.py
├── memory/
│   ├── test_orchestrator.py
│   ├── test_fact_memory.py
│   └── test_relationship_memory.py
├── tools/
│   ├── test_registry.py
│   └── test_tool_execution.py
└── hitl/
    └── test_hitl_service.py
```

---

# 实施清单

## Phase 1: 基础设施与核心框架

1. 创建 `ai-service/app/agents/tools/` 目录结构
2. 实现 `types.py` - 工具类型定义
3. 实现 `registry.py` - 工具注册中心
4. 实现 `decorators.py` - 工具装饰器
5. 实现 `base.py` - 工具基类
6. 迁移现有工具使用新装饰器（约15个文件）
7. 创建 `ai-service/app/types/multimodal.py` - 多模态类型
8. 创建 `ai-service/app/services/vision_service.py` - Vision服务
9. 修改 `context_builder.py` - 集成多模态上下文
10. 创建 `schema/memory_tables.pg.hcl` - 新数据表
11. 修改 `ai-service/app/orm/models.py` - 添加ORM模型
12. 运行 `make db-sync` 应用schema变更
13. 创建 `ai-service/app/agents/tools/discovery.py` - 工具自动发现

## Phase 2: 多层Agent架构

14. 创建 `ai-service/app/agents/safety/` 目录
15. 实现 `safety/types.py` - 安全类型
16. 实现 `safety/agent.py` - 安全Agent
17. 实现 `safety/filters.py` - 过滤规则
18. 创建 `ai-service/app/agents/intent/` 目录
19. 实现 `intent/types.py` - 意图类型
20. 实现 `intent/agent.py` - 意图识别Agent
21. 实现 `intent/router.py` - Agent路由器
22. 创建 `ai-service/app/agents/experts/` 目录
23. 实现 `experts/base.py` - 专家Agent基类
24. 实现 `experts/chat_expert.py` - 闲聊专家
25. 实现 `experts/search_expert.py` - 搜索专家
26. 实现 `experts/task_expert.py` - 任务专家
27. 创建 `ai-service/app/agents/response/` 目录
28. 实现 `response/agent.py` - 响应处理
29. 实现 `response/formatter.py` - 格式化器
30. 实现 `response/memory_trigger.py` - 记忆触发器

## Phase 3: 记忆系统深度重构

31. 创建 `ai-service/app/memory/types.py` - 记忆类型
32. 创建 `ai-service/app/memory/orchestrator.py` - 记忆编排器
33. 创建 `ai-service/app/memory/l1_working.py` - 工作记忆
34. 重构 `ai-service/app/memory/l2_episodic.py` - 情景记忆
35. 创建 `ai-service/app/memory/l3_semantic.py` - 语义记忆
36. 创建 `ai-service/app/memory/fact_memory.py` - 事实记忆服务
37. 创建 `ai-service/app/memory/relationship_memory.py` - 关系记忆
38. 创建 `ai-service/app/memory/emotional_memory.py` - 情感记忆
39. 实现 `ai-service/app/agents/memory/fact_tools.py` - 事实工具
40. 实现 `ai-service/app/agents/memory/relation_tools.py` - 关系工具
41. 实现 `ai-service/app/agents/memory/emotion_tools.py` - 情感工具
42. 修改 `ai-service/app/orm/crud.py` - 添加记忆CRUD

## Phase 4: 工具扩展

43. 创建 `ai-service/app/agents/media/` 目录
44. 实现 `media/tools.py` - 多媒体工具
45. 实现 `media/image_search.py` - 以图搜图
46. 实现 `media/image_edit.py` - 图片编辑
47. 创建 `ai-service/app/agents/compute/` 目录
48. 实现 `compute/tools.py` - 计算工具
49. 实现 `compute/calculator.py` - 数学计算
50. 实现 `compute/converter.py` - 单位转换
51. 创建 `ai-service/app/agents/external/` 目录
52. 实现 `external/weather.py` - 天气查询
53. 实现 `external/news.py` - 新闻聚合
54. 创建 `ai-service/app/agents/interaction/` 目录
55. 实现 `interaction/tools.py` - 交互工具
56. 实现 `interaction/message.py` - 消息发送
57. 实现 `interaction/card.py` - 卡片创建
58. 实现 `interaction/poll.py` - 投票创建

## Phase 5: 异步交互机制

59. 创建 `ai-service/app/hitl/` 目录
60. 实现 `hitl/types.py` - HITL类型
61. 实现 `hitl/service.py` - HITL服务
62. 实现 `hitl/handlers.py` - 响应处理器
63. 实现 `ai-service/app/api/hitl.py` - HITL API
64. 实现 `interaction/hitl_tools.py` - HITL工具
65. 修改 `ai-service/app/main.py` - 注册HITL路由
66. 修改 main-server 处理HITL卡片回调

## Phase 6: 集成与测试

67. 重构 `ai-service/app/agents/main/agent.py` - 集成多层架构
68. 修改 `ai-service/app/api/chat.py` - 使用新编排器
69. 创建 Langfuse prompts (safety-check, intent-recognition, search-expert等)
70. 创建测试套件 `tests/agents/`
71. 创建测试套件 `tests/memory/`
72. 创建测试套件 `tests/tools/`
73. 创建测试套件 `tests/hitl/`
74. 运行完整测试并验证功能
75. 更新配置文件 `ai-service/app/config/config.py`
76. 更新文档

---

# 当前执行步骤
"1. 详细规划阶段"

# 任务进度
[2025-12-09 初始化]
- 完成代码库全面分析
- 识别5大核心问题领域
- 提出5套解决方案

[2025-12-09 规划完成]
- 完成详细实施计划编写
- 6个阶段，76个实施步骤
- 涵盖工具注册、多层Agent、记忆重构、工具扩展、HITL

# 最终审查
[待完成]
