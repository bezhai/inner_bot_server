# 飞书闲聊记忆框架接口设计方案

## 1. 概述

本文档详细描述了飞书闲聊记忆框架的接口设计方案，包括统一的消息异步写入接口、多级检索接口和内部组件接口。该方案基于三层记忆模型（短期记忆、中期记忆和长期记忆）和AI驱动算法的需求，设计了一套灵活、高效、安全的接口体系。

### 1.1 系统定位

飞书闲聊记忆框架是为上层LLM聊天机器人设计的支持系统，负责记住用户闲聊内容和机器人自身回答。系统默认使用快速检索（`quick_search`）接口获取上下文，而深度搜索（`topic_search`）接口则作为工具（Tool）提供给大模型按需调用。该系统不直接与最终用户交互，不包含用户反馈机制，而是专注于为上层LLM提供高质量的记忆支持。

## 2. 接口设计原则

- **简洁性**：接口设计简洁明了，易于理解和使用
- **一致性**：接口命名、参数和返回值保持一致的风格和结构
- **可扩展性**：接口设计考虑未来功能扩展的需求
- **安全性**：接口设计考虑安全性，包括参数验证、错误处理和权限控制
- **可测试性**：接口设计便于单元测试和集成测试
- **文档化**：接口有详细的文档，包括参数说明、返回值说明和示例

## 3. 统一的消息异步写入接口

### 3.1 接口定义

#### 3.1.1 ChatMessage模型

```python
class ChatMessage(BaseModel):
    """
    聊天消息
    Chat message request
    """

    user_id: str  # 用户id（透传，不存储用户信息）/ User ID (passed through, not stored)
    user_name: str  # 用户名（透传，不存储用户信息）/ User name (passed through, not stored)
    content: str  # 转义成markdown的消息内容 / Markdown content
    is_mention_bot: bool  # 是否@机器人 / Mention bot
    role: str  # 角色: 'user' | 'assistant' / Role
    root_message_id: str  # 根消息id / Root message ID
    reply_message_id: Optional[str] = None  # 回复消息的id / Reply message ID
    message_id: str  # 消息id / Message ID
    chat_id: str  # 聊天id / Chat ID
    chat_type: str  # 聊天类型: 'p2p' | 'group' / Chat type
    create_time: str  # 创建时间 / Creation time
```

#### 3.1.2 消息写入接口

```python
@app.post("/api/v1/memory/message", response_model=MessageResponse)
async def store_message(message: ChatMessage, background_tasks: BackgroundTasks) -> MessageResponse:
    """
    存储消息并异步处理
    
    Args:
        message: 消息对象
        background_tasks: 后台任务
        
    Returns:
        MessageResponse: 响应对象
    """
    # 验证消息参数
    validate_message(message)
    
    # 转换create_time为datetime对象
    create_time = parse_datetime(message.create_time)
    
    # 创建消息对象
    msg = Message(
        message_id=message.message_id,
        chat_id=message.chat_id,
        user_id=message.user_id,  # 透传用户ID
        user_name=message.user_name,  # 透传用户名
        content=message.content,
        role=message.role,
        is_mention_bot=message.is_mention_bot,
        root_message_id=message.root_message_id,
        reply_message_id=message.reply_message_id,
        create_time=create_time
    )
    
    try:
        # 同步存储消息
        await memory_service.store_message(msg)
        
        # 异步处理消息
        background_tasks.add_task(memory_service.process_message, msg)
        
        return MessageResponse(
            message_id=message.message_id,
            status="success",
            message="Message stored successfully"
        )
    
    except Exception as e:
        logger.error(f"Failed to store message: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to store message: {str(e)}"
        )
```

#### 3.1.3 响应模型

```python
class MessageResponse(BaseModel):
    """
    消息响应
    Message response
    """
    
    message_id: str  # 消息ID / Message ID
    status: str  # 状态: 'success' | 'error' / Status
    message: str  # 消息 / Message
```

### 3.2 异步处理流程

1. **接收消息**：API接收ChatMessage对象
2. **参数验证**：验证消息参数的有效性
3. **同步存储**：将消息同步存储到数据库
4. **异步处理**：在后台任务中异步处理消息
   - 生成消息向量表示
   - 分类消息主题
   - 更新记忆强度
   - 触发摘要生成和结构化信息提取

### 3.3 错误处理

- **参数验证错误**：返回400 Bad Request，详细说明错误原因
- **存储错误**：返回500 Internal Server Error，记录错误日志
- **处理错误**：异步处理错误不影响API响应，但会记录错误日志

### 3.4 安全考虑

- **参数验证**：验证所有参数，防止注入攻击
- **速率限制**：对API调用进行速率限制，防止DoS攻击
- **日志记录**：记录API调用日志，便于审计和问题排查

## 4. 多级检索接口

### 4.1 快速检索接口

#### 4.1.1 请求模型

```python
class MemorySearchRequest(BaseModel):
    """
    记忆检索请求
    Memory search request
    """
    
    chat_id: str  # 聊天ID / Chat ID
    user_id: str  # 用户ID（透传，不存储用户信息）/ User ID (passed through, not stored)
    user_name: str  # 用户名（透传，不存储用户信息）/ User name (passed through, not stored)
    query: str  # 查询文本 / Query text
    context_message_id: Optional[str] = None  # 上下文消息ID / Context message ID
    max_results: Optional[int] = 10  # 最大结果数 / Maximum number of results
```

#### 4.1.2 检索接口

```python
@app.post("/api/v1/memory/quick_search", response_model=MemorySearchResponse)
async def quick_search(request: MemorySearchRequest) -> MemorySearchResponse:
    """
    快速检索记忆
    
    Args:
        request: 检索请求
        
    Returns:
        MemorySearchResponse: 响应对象
    """
    try:
        # 获取上下文消息
        context_message = None
        if request.context_message_id:
            context_message = await memory_service.get_message(request.context_message_id)
        
        # 检索短期记忆
        short_term_results = await memory_service.search_short_term_memory(
            chat_id=request.chat_id,
            query=request.query,
            context_message=context_message,
            max_results=request.max_results
        )
        
        # 检索长期记忆中的用户画像
        user_profile = await memory_service.get_user_profile(request.user_id)
        
        # 构建响应
        return MemorySearchResponse(
            query=request.query,
            short_term_memories=short_term_results,
            user_profile=user_profile,
            status="success"
        )
    
    except Exception as e:
        logger.error(f"Failed to search memory: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to search memory: {str(e)}"
        )
```

#### 4.1.3 响应模型

```python
class MemorySearchResponse(BaseModel):
    """
    记忆检索响应
    Memory search response
    """
    
    query: str  # 查询文本 / Query text
    short_term_memories: List[Dict]  # 短期记忆 / Short-term memories
    user_profile: Optional[Dict] = None  # 用户画像 / User profile
    status: str  # 状态: 'success' | 'error' / Status
```

### 4.2 特定主题检索接口

#### 4.2.1 请求模型

```python
class TopicSearchRequest(BaseModel):
    """
    主题检索请求
    Topic search request
    """
    
    chat_id: Optional[str] = None  # 聊天ID / Chat ID
    user_id: str  # 用户ID（透传，不存储用户信息）/ User ID (passed through, not stored)
    user_name: str  # 用户名（透传，不存储用户信息）/ User name (passed through, not stored)
    query: str  # 查询文本 / Query text
    topic_id: Optional[str] = None  # 主题ID / Topic ID
    include_original_messages: bool = False  # 是否包含原始消息 / Include original messages
    max_results: Optional[int] = 5  # 最大结果数 / Maximum number of results
```

#### 4.2.2 检索接口

```python
@app.post("/api/v1/memory/topic_search", response_model=TopicSearchResponse)
async def topic_search(request: TopicSearchRequest) -> TopicSearchResponse:
    """
    特定主题检索
    
    Args:
        request: 检索请求
        
    Returns:
        TopicSearchResponse: 响应对象
    """
    try:
        # 检索中期记忆
        if request.topic_id:
            # 如果指定了主题ID，直接检索该主题
            mid_term_results = await memory_service.get_topic_summary(request.topic_id)
        else:
            # 否则，根据查询文本检索相关主题
            mid_term_results = await memory_service.search_mid_term_memory(
                query=request.query,
                chat_id=request.chat_id,
                user_id=request.user_id,
                limit=request.max_results
            )
        
        # 检索长期记忆
        long_term_results = await memory_service.search_long_term_memory(
            query=request.query,
            user_id=request.user_id,
            limit=request.max_results
        )
        
        # 获取原始消息（如果需要）
        original_messages = []
        if request.include_original_messages and mid_term_results:
            for result in mid_term_results:
                topic_id = result.get("topic_id")
                if topic_id:
                    messages = await memory_service.retrieve_original_messages(topic_id, limit=10)
                    original_messages.extend(messages)
        
        # 构建响应
        return TopicSearchResponse(
            query=request.query,
            mid_term_memories=mid_term_results,
            long_term_memories=long_term_results,
            original_messages=original_messages if request.include_original_messages else None,
            status="success"
        )
    
    except Exception as e:
        logger.error(f"Failed to search topic: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to search topic: {str(e)}"
        )
```

#### 4.2.3 响应模型

```python
class TopicSearchResponse(BaseModel):
    """
    主题检索响应
    Topic search response
    """
    
    query: str  # 查询文本 / Query text
    mid_term_memories: List[Dict]  # 中期记忆 / Mid-term memories
    long_term_memories: List[Dict]  # 长期记忆 / Long-term memories
    original_messages: Optional[List[Dict]] = None  # 原始消息 / Original messages
    status: str  # 状态: 'success' | 'error' / Status
```

## 5. 内部组件接口

### 5.1 记忆控制器接口

记忆控制器负责协调短期记忆、中期记忆和长期记忆的交互。

```python
class MemoryController:
    """记忆控制器"""
    
    def __init__(
        self,
        short_term_memory: ShortTermMemory,
        mid_term_memory: MidTermMemory,
        long_term_memory: LongTermMemory
    ):
        """
        初始化记忆控制器
        
        Args:
            short_term_memory: 短期记忆
            mid_term_memory: 中期记忆
            long_term_memory: 长期记忆
        """
        self.short_term_memory = short_term_memory
        self.mid_term_memory = mid_term_memory
        self.long_term_memory = long_term_memory
    
    async def store_message(self, message: Message) -> None:
        """
        存储消息
        
        Args:
            message: 消息对象
        """
        await self.short_term_memory.store_message(message)
    
    async def process_message(self, message: Message) -> None:
        """
        处理消息
        
        Args:
            message: 消息对象
        """
        # 分类消息主题
        topic_id = await self.short_term_memory.classify_message_topic(message)
        
        # 更新记忆强度
        await self.update_memory_strength(message.message_id, "message")
        
        # 检查是否需要生成摘要
        await self.check_summary_generation(topic_id)
        
        # 提取结构化信息
        await self.extract_structured_information(message)
    
    async def search_memory(
        self,
        chat_id: str,
        query: str,
        user_id: str,
        context_message: Optional[Message] = None,
        max_results: int = 10
    ) -> Dict:
        """
        检索记忆
        
        Args:
            chat_id: 聊天ID
            query: 查询文本
            user_id: 用户ID（透传）
            context_message: 上下文消息
            max_results: 最大结果数
            
        Returns:
            Dict: 检索结果
        """
        # 检索短期记忆
        short_term_results = await self.short_term_memory.search(
            chat_id=chat_id,
            query=query,
            context_message=context_message,
            max_results=max_results
        )
        
        # 检索用户画像
        user_profile = await self.long_term_memory.get_user_profile(user_id)
        
        return {
            "short_term_memories": short_term_results,
            "user_profile": user_profile
        }
    
    async def search_topic(
        self,
        query: str,
        user_id: str,
        chat_id: Optional[str] = None,
        topic_id: Optional[str] = None,
        include_original_messages: bool = False,
        max_results: int = 5
    ) -> Dict:
        """
        检索主题
        
        Args:
            query: 查询文本
            user_id: 用户ID（透传）
            chat_id: 聊天ID
            topic_id: 主题ID
            include_original_messages: 是否包含原始消息
            max_results: 最大结果数
            
        Returns:
            Dict: 检索结果
        """
        # 检索中期记忆
        if topic_id:
            mid_term_results = await self.mid_term_memory.get_topic_summary(topic_id)
        else:
            mid_term_results = await self.mid_term_memory.search(
                query=query,
                chat_id=chat_id,
                user_id=user_id,
                limit=max_results
            )
        
        # 检索长期记忆
        long_term_results = await self.long_term_memory.search(
            query=query,
            user_id=user_id,
            limit=max_results
        )
        
        # 获取原始消息（如果需要）
        original_messages = []
        if include_original_messages and mid_term_results:
            for result in mid_term_results:
                topic_id = result.get("topic_id")
                if topic_id:
                    messages = await self.short_term_memory.retrieve_topic_messages(topic_id, limit=10)
                    original_messages.extend(messages)
        
        return {
            "mid_term_memories": mid_term_results,
            "long_term_memories": long_term_results,
            "original_messages": original_messages if include_original_messages else None
        }
```

### 5.2 主题分类器接口

主题分类器负责将消息分类到主题。

```python
class TopicClassifier:
    """主题分类器"""
    
    def __init__(
        self,
        embedding_service: EmbeddingService,
        llm_service: LLMService,
        db_pool: Pool,
        redis_client: Redis
    ):
        """
        初始化主题分类器
        
        Args:
            embedding_service: 向量嵌入服务
            llm_service: LLM服务
            db_pool: 数据库连接池
            redis_client: Redis客户端
        """
        self.embedding_service = embedding_service
        self.llm_service = llm_service
        self.db_pool = db_pool
        self.redis = redis_client
    
    async def classify_message(self, message: Message) -> str:
        """
        分类消息
        
        Args:
            message: 消息对象
            
        Returns:
            str: 主题ID
        """
        # 检查是否是回复消息
        if message.reply_message_id:
            # 获取回复消息的主题
            reply_topic_id = await self.get_message_topic(message.reply_message_id)
            if reply_topic_id:
                # 将消息关联到相同主题
                await self.associate_message_with_topic(message.message_id, reply_topic_id)
                return reply_topic_id
        
        # 获取消息向量表示
        if not message.content_vector:
            message.content_vector = await self.embedding_service.get_embedding(message.content)
        
        # 获取活跃主题
        active_topics = await self.get_active_topics(message.chat_id)
        
        # 计算消息与主题的相似度
        if active_topics:
            similarities = []
            for topic in active_topics:
                if not topic.topic_vector:
                    continue
                similarity = cosine_similarity(message.content_vector, topic.topic_vector)
                similarities.append((topic, similarity))
            
            # 按相似度排序
            similarities.sort(key=lambda x: x[1], reverse=True)
            
            # 如果最高相似度超过阈值，归属到该主题
            if similarities and similarities[0][1] > 0.7:
                best_topic = similarities[0][0]
                await self.associate_message_with_topic(message.message_id, best_topic.topic_id)
                return best_topic.topic_id
            
            # 如果相似度适中，使用LLM辅助判断
            elif similarities and similarities[0][1] > 0.5:
                # 获取主题的最近消息
                top_topics = similarities[:3]
                topic_messages = {}
                for topic, _ in top_topics:
                    messages = await self.get_topic_recent_messages(topic.topic_id, limit=5)
                    topic_messages[topic.topic_id] = messages
                
                # 使用LLM判断主题归属
                topic_id = await self.llm_topic_decision(
                    message, 
                    [(t[0], t[1]) for t in top_topics], 
                    topic_messages
                )
                
                if topic_id:
                    await self.associate_message_with_topic(message.message_id, topic_id)
                    return topic_id
        
        # 创建新主题
        # 使用LLM生成主题标题
        title = await self.generate_topic_title(message.content)
        
        # 创建新主题
        topic = Topic(
            topic_id=str(uuid.uuid4()),
            title=title,
            creator_id=message.user_id,
            chat_id=message.chat_id,
            topic_vector=message.content_vector,
            create_time=datetime.now(),
            update_time=datetime.now()
        )
        
        # 存储新主题
        await self.store_topic(topic)
        
        # 将消息关联到新主题
        await self.associate_message_with_topic(message.message_id, topic.topic_id)
        
        return topic.topic_id
```

### 5.3 上下文组装器接口

上下文组装器负责从不同记忆层次选择和组合最相关的信息。

```python
class ContextAssembler:
    """上下文组装器"""
    
    def __init__(
        self,
        short_term_memory: ShortTermMemory,
        mid_term_memory: MidTermMemory,
        long_term_memory: LongTermMemory
    ):
        """
        初始化上下文组装器
        
        Args:
            short_term_memory: 短期记忆
            mid_term_memory: 中期记忆
            long_term_memory: 长期记忆
        """
        self.short_term_memory = short_term_memory
        self.mid_term_memory = mid_term_memory
        self.long_term_memory = long_term_memory
    
    async def assemble_context(
        self,
        query: str,
        chat_id: str,
        user_id: str,
        context_message: Optional[Message] = None,
        max_tokens: int = 2000
    ) -> str:
        """
        组装上下文
        
        Args:
            query: 查询文本
            chat_id: 聊天ID
            user_id: 用户ID（透传）
            context_message: 上下文消息
            max_tokens: 最大token数
            
        Returns:
            str: 组装后的上下文
        """
        # 检索短期记忆
        short_term_results = await self.short_term_memory.search(
            chat_id=chat_id,
            query=query,
            context_message=context_message,
            max_results=10
        )
        
        # 检索用户画像
        user_profile = await self.long_term_memory.get_user_profile(user_id)
        
        # 估算token数
        short_term_tokens = estimate_tokens(short_term_results)
        user_profile_tokens = estimate_tokens(user_profile) if user_profile else 0
        
        # 如果短期记忆和用户画像的token数已经超过限制，进行截断
        if short_term_tokens + user_profile_tokens > max_tokens:
            # 优先保留用户画像
            remaining_tokens = max_tokens - user_profile_tokens
            if remaining_tokens > 0:
                short_term_results = truncate_results(short_term_results, remaining_tokens)
            else:
                short_term_results = []
        
        # 组装上下文
        context = ""
        
        # 添加用户画像
        if user_profile:
            context += f"User Profile:\n{user_profile.get('profile_text', '')}\n\n"
        
        # 添加短期记忆
        if short_term_results:
            context += "Recent Conversation:\n"
            for message in short_term_results:
                context += f"{message.get('user_name')}: {message.get('content')}\n"
        
        return context
```

### 5.4 结构化信息提取接口

结构化信息提取器负责从消息中提取实体、关系和用户画像等结构化信息。

```python
class StructuredInfoExtractor:
    """结构化信息提取器"""
    
    def __init__(
        self,
        llm_service: LLMService,
        embedding_service: EmbeddingService,
        db_pool: Pool
    ):
        """
        初始化结构化信息提取器
        
        Args:
            llm_service: LLM服务
            embedding_service: 向量嵌入服务
            db_pool: 数据库连接池
        """
        self.llm_service = llm_service
        self.embedding_service = embedding_service
        self.db_pool = db_pool
    
    async def extract_structured_information(self, messages: List[Message]) -> Dict:
        """
        提取结构化信息
        
        Args:
            messages: 消息列表
            
        Returns:
            Dict: 结构化信息
        """
        # 1. 提取实体
        entities = await self.extract_entities(messages)
        
        # 2. 提取关系
        relations = await self.extract_relations(messages, entities)
        
        # 3. 提取用户画像
        user_profiles = {}
        for message in messages:
            if message.role == "user" and message.user_id not in user_profiles:
                user_messages = [msg for msg in messages if msg.user_id == message.user_id]
                user_profile = await self.extract_user_profile(message.user_id, message.user_name, user_messages)
                user_profiles[message.user_id] = user_profile
        
        return {
            "entities": entities,
            "relations": relations,
            "user_profiles": list(user_profiles.values())
        }
    
    async def extract_entities(self, messages: List[Message]) -> List[Dict]:
        """
        从消息中提取实体
        
        Args:
            messages: 消息列表
            
        Returns:
            List[Dict]: 实体列表
        """
        # 构建提示
        conversation = []
        for message in messages:
            conversation.append({
                "role": message.role,
                "content": message.content,
                "user_name": message.user_name
            })
        
        prompt = f"""
        从以下对话中提取重要实体（人物、地点、组织、产品等）：
        
        {json.dumps(conversation, ensure_ascii=False, indent=2)}
        
        请以JSON格式返回实体列表，包含以下字段：
        - entity_name: 实体名称
        - entity_type: 实体类型（PERSON, LOCATION, ORGANIZATION, PRODUCT, EVENT, OTHER）
        - confidence: 置信度（0-1之间的浮点数）
        - mentions: 在对话中的提及次数
        - description: 根据对话内容生成的实体描述
        
        只提取对话中明确提及且重要的实体，忽略不重要或模糊的实体。
        """
        
        # 调用LLM
        response = await self.llm_service.generate(prompt)
        
        # 解析响应
        try:
            # 尝试直接解析JSON
            entities = json.loads(response)
        except json.JSONDecodeError:
            # 如果直接解析失败，尝试从文本中提取JSON部分
            match = re.search(r'```json\n(.*?)\n```', response, re.DOTALL)
            if match:
                try:
                    entities = json.loads(match.group(1))
                except json.JSONDecodeError:
                    logger.error("解析实体JSON失败")
                    return []
            else:
                logger.error("响应中未找到JSON")
                return []
        
        # 验证和清理实体
        valid_entities = []
        for entity in entities:
            if isinstance(entity, dict) and "entity_name" in entity and "entity_type" in entity:
                # 确保必要字段存在
                entity = {
                    "entity_name": entity["entity_name"],
                    "entity_type": entity["entity_type"],
                    "confidence": entity.get("confidence", 0.8),
                    "mentions": entity.get("mentions", 1),
                    "description": entity.get("description", "")
                }
                valid_entities.append(entity)
        
        return valid_entities
```

## 6. 接口版本和扩展性

### 6.1 版本控制

- **URL版本控制**：在URL路径中包含版本号，如`/api/v1/memory/message`
- **请求头版本控制**：在请求头中包含版本信息，如`X-API-Version: 1`
- **接受头版本控制**：在Accept头中包含版本信息，如`Accept: application/vnd.memory.v1+json`

### 6.2 扩展性考虑

- **向后兼容**：新版本接口保持对旧版本的兼容性
- **可选参数**：使用可选参数扩展接口功能，避免破坏现有接口
- **功能标志**：使用功能标志控制新功能的启用和禁用
- **渐进式迁移**：旧接口和新接口并行运行，逐步迁移到新接口

### 6.3 接口文档

- **OpenAPI规范**：使用OpenAPI规范描述接口
- **自动生成文档**：使用FastAPI自动生成接口文档
- **示例代码**：提供各种语言的接口调用示例代码
- **接口测试**：提供接口测试工具，便于开发者测试接口

## 7. 总结

本文档详细描述了飞书闲聊记忆框架的接口设计方案，包括统一的消息异步写入接口、多级检索接口和内部组件接口。该方案基于三层记忆模型（短期记忆、中期记忆和长期记忆）和AI驱动算法的需求，设计了一套灵活、高效、安全的接口体系。

主要特点包括：

1. **统一的消息异步写入接口**：提供简洁的消息写入接口，支持异步处理和错误处理。
2. **多级检索接口**：提供快速检索和特定主题检索两种接口，满足不同场景的需求。
3. **内部组件接口**：设计记忆控制器、主题分类器、上下文组装器和结构化信息提取器等内部组件接口，支持系统的模块化和可扩展性。
4. **接口版本和扩展性**：考虑接口的版本控制和扩展性，确保系统能够平滑升级和扩展。

该接口设计方案为飞书闲聊记忆框架提供了坚实的接口基础，能够支持高效的记忆存储、检索和管理，满足用户对个性化、连贯和智能对话体验的需求。
