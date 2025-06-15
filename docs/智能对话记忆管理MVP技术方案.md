# 智能对话记忆管理框架 MVP 版本技术方案

## 1. 项目背景与目标

### 1.1 核心问题

- **话题混杂**：基于时间窗口的消息召回会混入多个无关话题
- **信息密度低**：群聊消息量大，相关性低，增加Token消耗
- **上下文断裂**：回复链和语义关联无法有效追踪

### 1.2 MVP目标

- 建立基础的记忆管理架构（在ai-service中）
- 实现基于规则的智能上下文召回
- 收集数据为后续模型训练做准备
- 显著降低Token消耗并提升回答相关性

### 1.3 设计理念

**"渐进式智能化"**：先用简单有效的规则解决80%的问题，同时收集数据为后续引入模型做准备。

## 2. 总体架构设计

### 2.1 嵌入式集成架构

```
┌─────────────────────────────────────────────────────────────┐
│                    main-server                              │
│              消息接收与转发                                  │
│  • 接收Lark消息事件                                         │
│  • 调用ai-service的SSE接口                                 │
│  • 渲染和发送Bot回复                                        │
└─────────────────┬───────────────────────────────────────────┘
                  │ HTTP /chat/sse
                  ▼
┌─────────────────────────────────────────────────────────────┐
│                    ai-service                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │            现有Chat处理流程                              │ │
│  │  • ChatService.process_chat_sse()                     │ │
│  │  • AIChatService.stream_ai_reply()                    │ │
│  │  • MessageContext.init_context_messages()            │ │
│  └─────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │        智能记忆管理模块（嵌入集成）                       │ │
│  │  • 替换现有的ContextService.build_*_context()         │ │
│  │  • 增强MessageContext的上下文构建逻辑                   │ │
│  │  • 集成到现有的聊天处理流程中                             │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 集成到现有ai-service架构

```
ai-service/app/
├── services/
│   ├── chat/                      # 现有聊天服务（增强）
│   │   ├── context.py            # 现有上下文服务（将被增强）
│   │   ├── message.py            # 现有消息服务
│   │   ├── model.py              # 现有模型服务
│   │   └── memory/               # 新增：智能记忆管理模块
│   │       ├── __init__.py
│   │       ├── context_builder.py    # 智能上下文构建器
│   │       ├── message_analyzer.py   # 消息分析器
│   │       ├── relevance_scorer.py   # 相关性评分器
│   │       └── data_collector.py     # 数据收集器
│   ├── chat_service.py           # 现有服务（无需修改）
│   └── search/                   # 现有搜索服务
├── types/
│   └── memory.py                 # 新增：记忆相关数据类型
└── api/
    └── chat.py                   # 现有聊天API（无需修改）
```

## 3. 核心组件设计

### 3.1 消息分析器 (MessageAnalyzer)

**功能**：分析消息特征，提取关键信息用于上下文构建

```python
class MessageAnalyzer:
    def analyze_message(self, message: dict) -> MessageFeatures:
        """分析消息特征"""
        return MessageFeatures(
            message_id=message["message_id"],
            user_id=message["user_id"],
            group_id=message["group_id"],
            content=message["content"],
            timestamp=message["timestamp"],
            reply_to=self._extract_reply_info(message),
            mentions=self._extract_mentions(message),
            message_type=self._classify_message_type(message),
            keywords=self._extract_keywords(message)
        )
    
    def _extract_reply_info(self, message: dict) -> Optional[ReplyInfo]:
        """提取回复信息"""
        # 解析@回复和quote回复
        pass
    
    def _extract_mentions(self, message: dict) -> List[str]:
        """提取@用户信息"""
        pass
    
    def _classify_message_type(self, message: dict) -> MessageType:
        """分类消息类型：问题、回答、闲聊、通知等"""
        pass
```

### 3.2 相关性评分器 (RelevanceScorer)

**功能**：基于多个维度计算消息的相关性分数

```python
class RelevanceScorer:
    def __init__(self):
        self.weights = {
            'reply_chain': 0.4,      # 回复链权重最高
            'user_continuity': 0.15,  # 用户连续性
            'time_decay': 0.2,       # 时间衰减
            'mention_relation': 0.15, # @关系
            'keyword_overlap': 0.1    # 关键词重叠
        }
    
    def calculate_relevance(self, 
                          target_message: MessageFeatures,
                          candidate_message: MessageFeatures,
                          context: ConversationContext) -> float:
        """计算候选消息与目标消息的相关性分数"""
        
        scores = {
            'reply_chain': self._score_reply_chain(target_message, candidate_message),
            'user_continuity': self._score_user_continuity(target_message, candidate_message),
            'time_decay': self._score_time_decay(target_message, candidate_message),
            'mention_relation': self._score_mention_relation(target_message, candidate_message),
            'keyword_overlap': self._score_keyword_overlap(target_message, candidate_message)
        }
        
        # 加权计算总分
        total_score = sum(scores[key] * self.weights[key] for key in scores)
        return min(total_score, 1.0)  # 确保分数不超过1
```

### 3.3 增强的上下文服务 (EnhancedContextService)

**功能**：替换现有的ContextService，提供智能的上下文构建

```python
# ai-service/app/services/chat/memory/context_builder.py
from app.services.chat.context import ContextService  # 继承现有服务

class EnhancedContextService(ContextService):
    """增强的上下文服务，基于智能记忆管理"""
    
    def __init__(self):
        super().__init__()
        self.analyzer = MessageAnalyzer()
        self.scorer = RelevanceScorer()
        self.data_collector = DataCollector()
    
    async def build_intelligent_context(
        self, 
        current_message: ChatMessage,
        max_context: int = 20,
        time_window_hours: int = 24
    ) -> List[ChatSimpleMessage]:
        """
        智能构建对话上下文，替换原有的build_*_context方法
        """
        try:
            # 1. 分析当前消息特征
            message_features = self.analyzer.analyze_message(current_message)
            
            # 2. 获取候选消息池（复用现有逻辑）
            candidates = await self._get_candidate_messages(
                current_message, time_window_hours
            )
            
            # 3. 智能评分和筛选
            scored_messages = []
            for candidate in candidates:
                candidate_features = self.analyzer.analyze_message(candidate)
                score = self.scorer.calculate_relevance(
                    message_features, candidate_features
                )
                scored_messages.append((candidate, score))
            
            # 4. 选择最优上下文
            selected_messages = self._select_optimal_context(
                scored_messages, max_context
            )
            
            # 5. 数据收集（异步）
            asyncio.create_task(
                self.data_collector.record_context_usage(
                    current_message, selected_messages, scored_messages
                )
            )
            
            # 6. 转换为标准格式
            return self._convert_to_simple_messages(selected_messages)
            
        except Exception as e:
            logger.error(f"智能上下文构建失败: {str(e)}")
            # 降级到原有方法
            return await super().build_conversation_context(
                current_message, max_context
            )
    
    async def _get_candidate_messages(
        self, current_message: ChatMessage, time_window_hours: int
    ) -> List[ChatMessage]:
        """获取候选消息，整合回复链和时间窗口"""
        candidates = []
        
        # 获取回复链消息（高优先级）
        thread_messages = await get_messages_by_root_id(
            current_message.root_message_id,
            exclude_current=current_message.message_id,
            limit=15
        )
        candidates.extend(thread_messages)
        
        # 获取时间窗口内的消息
        current_time = datetime.fromtimestamp(int(current_message.create_time) / 1000)
        time_window_start = current_time - timedelta(hours=time_window_hours)
        
        recent_messages = await get_recent_messages_in_chat(
            chat_id=current_message.chat_id,
            before_time=current_time,
            after_time=time_window_start,
            limit=50,  # 增大候选池
            exclude_current=current_message.message_id
        )
        candidates.extend(recent_messages)
        
        # 去重
        unique_candidates = {msg.message_id: msg for msg in candidates}
        return list(unique_candidates.values())
```

## 4. 数据模型设计

### 4.1 核心数据结构

```python
from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import datetime
from enum import Enum

class MessageType(str, Enum):
    QUESTION = "question"
    ANSWER = "answer"
    DISCUSSION = "discussion"
    NOTIFICATION = "notification"
    CASUAL = "casual"

class ReplyInfo(BaseModel):
    reply_to_message_id: str
    reply_to_user_id: str
    reply_type: str  # "quote", "mention", "thread"

class MessageFeatures(BaseModel):
    message_id: str
    user_id: str
    group_id: str
    content: str
    timestamp: int
    reply_to: Optional[ReplyInfo] = None
    mentions: List[str] = []
    message_type: MessageType
    keywords: List[str] = []

class ConversationContext(BaseModel):
    trigger_message: dict
    context_messages: List[dict]
    group_id: str
    created_at: datetime
    context_summary: Optional[str] = None
    relevance_scores: Dict[str, float] = {}

class ContextUsageRecord(BaseModel):
    """记录上下文使用情况，用于后续优化"""
    context_id: str
    group_id: str
    user_id: str
    trigger_message_id: str
    context_message_ids: List[str]
    llm_response: str
    user_feedback: Optional[str] = None
    success_indicator: Optional[float] = None  # 成功指标（如用户满意度）
    created_at: datetime
```

### 4.2 数据库设计

```sql
-- 上下文使用记录表
CREATE TABLE context_usage_records (
    id SERIAL PRIMARY KEY,
    context_id VARCHAR(255) NOT NULL,
    group_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    trigger_message_id VARCHAR(255) NOT NULL,
    context_message_ids JSONB NOT NULL,
    llm_response TEXT,
    user_feedback TEXT,
    success_indicator FLOAT,
    relevance_scores JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_group_user (group_id, user_id),
    INDEX idx_created_at (created_at)
);

-- 消息特征缓存表（提升性能）
CREATE TABLE message_features_cache (
    message_id VARCHAR(255) PRIMARY KEY,
    group_id VARCHAR(255) NOT NULL,
    features JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_group_time (group_id, created_at)
);
```

## 5. 集成到现有处理流程

### 5.1 修改MessageContext类

```python
# ai-service/app/services/chat/context.py (修改现有文件)
from app.services.chat.memory.context_builder import EnhancedContextService

class MessageContext:
    """消息上下文类（增强版）"""

    def __init__(
        self,
        message: ChatMessage,
        system_prompt_generator: Callable[[PromptGeneratorParam], str],
    ):
        self.message = message
        self.system_prompt_generator = system_prompt_generator
        self.context_messages: List[ChatSimpleMessage] = []
        
        # 使用增强的上下文服务
        self.enhanced_context_service = EnhancedContextService()

    async def init_context_messages(self, use_intelligent_context: bool = True):
        """
        初始化上下文消息（增强版）
        
        Args:
            use_intelligent_context: 是否使用智能上下文构建
        """
        try:
            if use_intelligent_context:
                # 使用智能记忆管理构建上下文
                logger.info("使用智能记忆管理构建上下文")
                self.context_messages = await self.enhanced_context_service.build_intelligent_context(
                    current_message=self.message,
                    max_context=20
                )
            else:
                # 降级到原有方法
                logger.info("降级使用传统上下文构建")
                self.context_messages = await ContextService.build_conversation_context(
                    current_message=self.message,
                    max_context=10
                )
                
            logger.info(f"上下文构建完成，包含 {len(self.context_messages)} 条消息")
            
        except Exception as e:
            logger.error(f"上下文构建失败: {str(e)}")
            # 最后降级策略：空上下文
            self.context_messages = []
```

## 6. 配置与开关控制

### 6.1 智能记忆开关配置

```python
# ai-service/app/config/memory_config.py
from pydantic_settings import BaseSettings

class MemoryConfig(BaseSettings):
    # 功能开关
    enable_intelligent_memory: bool = True  # 智能记忆总开关
    fallback_on_error: bool = True          # 出错时是否降级
    
    # 上下文构建配置
    max_context_messages: int = 20
    time_window_hours: int = 24
    relevance_threshold: float = 0.3
    
    # 相关性评分权重
    reply_chain_weight: float = 0.4
    user_continuity_weight: float = 0.15
    time_decay_weight: float = 0.2
    mention_relation_weight: float = 0.15
    keyword_overlap_weight: float = 0.1
    
    # 性能配置
    context_build_timeout_seconds: int = 5
    enable_async_data_collection: bool = True
    
    class Config:
        env_prefix = "MEMORY_"

# 全局配置实例
memory_config = MemoryConfig()
```

### 6.2 集成到现有Chat流程

```python
# ai-service/app/services/chat/message.py (修改现有文件)
from app.config.memory_config import memory_config

class AIChatService:
    @staticmethod
    async def stream_ai_reply(
        message: ChatMessage,
        model_id: str = "gpt-4o-mini",
        temperature: float = 0.7,
        enable_tools: bool = False,
        max_tool_iterations: int = 10,
    ) -> AsyncGenerator[ChatStreamChunk, None]:
        """
        生成AI回复的流式响应，集成智能记忆管理
        """
        # 创建消息上下文（已经集成了智能记忆）
        message_context = MessageContext(message, PromptService.get_prompt)
        
        # 初始化上下文消息，使用配置控制是否启用智能记忆
        await message_context.init_context_messages(
            use_intelligent_context=memory_config.enable_intelligent_memory
        )

        # 其余处理流程保持不变...
        tools = None
        if enable_tools:
            try:
                tool_manager = get_tool_manager()
                tools = tool_manager.get_tools_schema()
            except RuntimeError:
                enable_tools = False

        try:
            async for chunk in ModelService.chat_completion_stream(
                model_id=model_id,
                context=message_context,
                temperature=temperature,
                tools=tools,
                max_tool_iterations=max_tool_iterations,
            ):
                if chunk.delta and chunk.delta.content:
                    yield ChatStreamChunk(content=chunk.delta.content)

                if chunk.finish_reason:
                    logger.info(f"chunk.finish_reason: {chunk.finish_reason}")
                    if chunk.finish_reason == "content_filter":
                        yield ChatStreamChunk(content="赤尾有点不想讨论这个话题呢~")
                    elif chunk.finish_reason == "length":
                        yield ChatStreamChunk(content="(后续内容被截断)")

                    if chunk.finish_reason != "tool_calls":
                        break

        except Exception as e:
            logger.error(f"生成回复时出现错误: {str(e)}")
            yield ChatStreamChunk(content=f"生成回复时出现错误: {str(e)}")
```

## 7. 部署和环境变量

### 7.1 环境变量配置

```bash
# .env 文件中添加智能记忆相关配置
# 智能记忆功能开关
MEMORY_ENABLE_INTELLIGENT_MEMORY=true
MEMORY_FALLBACK_ON_ERROR=true

# 上下文构建参数
MEMORY_MAX_CONTEXT_MESSAGES=20
MEMORY_TIME_WINDOW_HOURS=24
MEMORY_RELEVANCE_THRESHOLD=0.3

# 相关性评分权重
MEMORY_REPLY_CHAIN_WEIGHT=0.4
MEMORY_USER_CONTINUITY_WEIGHT=0.15
MEMORY_TIME_DECAY_WEIGHT=0.2
MEMORY_MENTION_RELATION_WEIGHT=0.15
MEMORY_KEYWORD_OVERLAP_WEIGHT=0.1

# 性能参数
MEMORY_CONTEXT_BUILD_TIMEOUT_SECONDS=5
MEMORY_ENABLE_ASYNC_DATA_COLLECTION=true
```

## 8. 监控与评估

### 8.1 关键指标

```python
class MemoryMetrics:
    @staticmethod
    async def collect_metrics():
        return {
            # 性能指标
            "avg_context_build_time_ms": await get_avg_build_time(),
            "context_cache_hit_rate": await get_cache_hit_rate(),
            
            # 质量指标
            "avg_relevance_score": await get_avg_relevance_score(),
            "avg_context_message_count": await get_avg_message_count(),
            "token_savings_rate": await get_token_savings_rate(),
            
            # 使用指标
            "contexts_built_per_hour": await get_contexts_per_hour(),
            "unique_groups_served": await get_unique_groups(),
            
            # 反馈指标（后续收集）
            "user_satisfaction_score": await get_satisfaction_score(),
            "context_effectiveness_rate": await get_effectiveness_rate()
        }
```

### 8.2 监控面板

在现有的Kibana中添加记忆管理相关的监控面板：

- 上下文构建性能趋势
- 相关性分数分布
- Token节省效果统计
- 错误率和降级情况

## 9. 实施计划

### 9.1 第一阶段（Week 1-2）：基础架构

- [ ] 在ai-service/app/services/chat/memory/中创建记忆管理模块
- [ ] 实现MessageAnalyzer基础功能（消息特征提取）
- [ ] 实现RelevanceScorer基础评分逻辑
- [ ] 创建memory_config.py配置文件和数据类型定义
- [ ] 设计和创建数据库表（context_usage_records等）

### 9.2 第二阶段（Week 3-4）：核心功能集成

- [ ] 实现EnhancedContextService，继承现有ContextService
- [ ] 修改MessageContext类，集成智能上下文构建
- [ ] 修改AIChatService，添加配置开关
- [ ] 实现降级机制和错误处理
- [ ] 添加基础的数据收集功能

### 9.3 第三阶段（Week 5-6）：测试和优化

- [ ] 在开发环境启用智能记忆功能
- [ ] 实现完整的DataCollector数据收集
- [ ] 添加监控指标和日志
- [ ] 性能测试和参数调优
- [ ] 完善错误处理和降级策略

### 9.4 第四阶段（Week 7-8）：线上部署

- [ ] 灰度发布：部分群组启用智能记忆
- [ ] 监控关键指标：响应时间、准确性、Token消耗
- [ ] 基于反馈调整参数权重
- [ ] 全量发布和效果评估

## 10. 风险控制

### 10.1 降级策略

- **智能记忆构建失败**：自动降级到现有的ContextService方法
- **数据库不可用**：禁用数据收集，继续提供服务
- **性能超时**：设置5秒超时，超时后使用传统方法
- **配置错误**：使用默认配置参数确保服务稳定

### 10.2 监控告警

- 智能上下文构建时间超过5秒（触发降级）
- 智能记忆使用降级率超过10%
- 上下文构建错误率超过5%
- 相关性评分异常偏低（平均分<0.2）

## 11. 后续演进路径

### 11.1 数据驱动优化

基于收集的数据进行：

- 相关性评分权重自动调优
- 不同群组的个性化配置
- 基于反馈的质量提升

### 11.2 模型升级准备

- 收集高质量的话题标注数据
- 建立模型训练和评估管道
- 设计模型A/B测试框架

### 11.3 功能扩展

- 跨群组的知识共享
- 个人记忆档案
- 长期记忆的周期性总结

---

## 总结

本MVP方案通过在ai-service中建立智能的上下文构建机制，在不依赖复杂模型的前提下，显著提升了Bot的回答相关性并降低了Token消耗。同时为后续的模型化升级奠定了坚实的数据和架构基础。

重点是实现一个"足够好"的解决方案，同时收集宝贵的实际使用数据，为未来的智能化升级提供支撑。
