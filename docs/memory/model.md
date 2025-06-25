# 飞书闲聊记忆框架三层记忆模型实现方案

## 1. 概述

本文档详细描述了飞书闲聊记忆框架的三层记忆模型实现方案，包括短期记忆、中期记忆和长期记忆的具体实现细节。该方案基于"拥抱AI，尽量减少固定规则"的原则，设计了一套灵活、高效、智能的记忆系统，为飞书闲聊场景提供强大的记忆支持。

### 1.1 系统定位

本记忆框架是为上层LLM聊天机器人设计的支持系统，负责记住用户闲聊内容和机器人自身回答。系统默认使用快速检索（`quick_search`）获取上下文，而深度搜索（`topic_search`）作为tools提供给大模型按需调用。系统不直接与最终用户交互，因此不包含用户主动反馈等直接交互机制。

### 1.2 用户信息处理

系统中的用户ID和用户名仅作为消息的属性直接存储，不创建任何ID和名称之间的映射关系，也不对用户信息进行任何额外处理或管理。用户ID用于避免重名问题，系统只存储透传的信息，不维护用户状态。

## 2. 短期记忆实现

短期记忆主要存储最近的原始对话内容，用于维持对话的连贯性和上下文理解。

### 2.1 数据结构设计

#### 2.1.1 消息结构

```python
class Message(BaseModel):
    message_id: str                  # 消息ID
    chat_id: str                     # 聊天ID
    user_id: str                     # 用户ID（透传，不存储用户信息）
    user_name: str                   # 用户名（透传，不存储用户信息）
    content: str                     # 消息内容
    content_vector: Optional[List[float]] = None  # 消息内容的向量表示
    role: str                        # 角色：user 或 assistant
    is_mention_bot: bool = False     # 是否@机器人
    root_message_id: Optional[str] = None  # 根消息ID
    reply_message_id: Optional[str] = None  # 回复消息ID
    topic_id: Optional[str] = None   # 主题ID
    create_time: datetime            # 创建时间
```

#### 2.1.2 主题结构

```python
class Topic(BaseModel):
    topic_id: str                    # 主题ID
    title: str                       # 主题标题
    description: Optional[str] = None  # 主题描述
    creator_id: str                  # 创建者ID（透传，不存储用户信息）
    chat_id: str                     # 聊天ID
    keywords: Optional[Dict] = None  # 主题关键词
    topic_vector: Optional[List[float]] = None  # 主题的向量表示
    create_time: datetime            # 创建时间
    update_time: datetime            # 更新时间
    is_active: bool = True           # 是否活跃
    is_archived: bool = False        # 是否归档
```

### 2.2 存储方式

短期记忆采用混合存储方式，结合数据库持久化和缓存加速：

1. **数据库存储**：
   - 使用PostgreSQL存储消息和主题的结构化信息
   - 使用Qdrant存储消息和主题的向量表示，用于语义相似度搜索
2. **缓存加速**：使用Redis缓存最近的消息和活跃主题，提高访问速度。

### 2.3 实时Topic归因

实时Topic归因是短期记忆的核心功能，能够将新消息实时归类到已有主题或创建新主题。

#### 2.3.1 归因算法流程

1. **回复链检查**：如果消息是对已有消息的回复，优先继承被回复消息的主题。
2. **向量相似度计算**：计算消息与活跃主题的向量相似度，找出最相似的主题。
3. **LLM辅助决策**：在相似度不明确的情况下，使用LLM辅助判断消息应归属的主题。
4. **新主题创建**：如果没有找到相似主题，创建新主题并生成标题。

#### 2.3.2 核心函数实现

```python
async def classify_message_topic(message: Message) -> str:
    """
    将消息归类到主题
    
    Args:
        message: 消息对象
        
    Returns:
        str: 主题ID
    """
    # 1. 检查是否是回复消息
    if message.reply_message_id:
        # 获取回复消息的主题
        reply_topic_id = await get_message_topic(message.reply_message_id)
        if reply_topic_id:
            # 将消息关联到相同主题
            await associate_message_with_topic(message.message_id, reply_topic_id)
            return reply_topic_id
    
    # 2. 获取消息向量表示
    if not message.content_vector:
        message.content_vector = await get_embedding(message.content)
    
    # 3. 获取活跃主题
    active_topics = await get_active_topics(message.chat_id)
    
    # 4. 计算消息与主题的相似度
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
            await associate_message_with_topic(message.message_id, best_topic.topic_id)
            return best_topic.topic_id
        
        # 如果相似度适中，使用LLM辅助判断
        elif similarities and similarities[0][1] > 0.5:
            # 获取主题的最近消息
            top_topics = similarities[:3]
            topic_messages = {}
            for topic, _ in top_topics:
                messages = await get_topic_recent_messages(topic.topic_id, limit=5)
                topic_messages[topic.topic_id] = messages
            
            # 使用LLM判断主题归属
            topic_id = await llm_topic_decision_enhanced(
                message, 
                [(t[0], t[1]) for t in top_topics], 
                topic_messages
            )
            
            if topic_id:
                await associate_message_with_topic(message.message_id, topic_id)
                return topic_id
    
    # 5. 创建新主题
    # 使用LLM生成主题标题
    title = await generate_topic_title(message.content)
    
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
    await store_topic(topic)
    
    # 将消息关联到新主题
    await associate_message_with_topic(message.message_id, topic.topic_id)
    
    return topic.topic_id
```

#### 2.3.3 LLM辅助决策函数

```python
async def llm_topic_decision_enhanced(
    message: Message, 
    topic_candidates: List[Tuple[Topic, float]], 
    topic_messages: Dict[str, List[Message]]
) -> Optional[str]:
    """
    使用LLM辅助判断消息应归属的主题
    
    Args:
        message: 当前消息
        topic_candidates: 候选主题及其相似度
        topic_messages: 每个主题的最近消息
        
    Returns:
        Optional[str]: 主题ID，如果无法判断则返回None
    """
    # 构建提示
    prompt = f"""
    当前消息:
    用户: {message.user_name}
    内容: {message.content}
    
    候选主题:
    """
    
    for i, (topic, similarity) in enumerate(topic_candidates):
        prompt += f"\n{i+1}. 主题: {topic.title} (相似度: {similarity:.2f})\n"
        prompt += f"   描述: {topic.description or '无'}\n"
        prompt += "   最近消息:\n"
        
        messages = topic_messages.get(topic.topic_id, [])
        for msg in messages:
            prompt += f"   - {msg.user_name}: {msg.content}\n"
    
    prompt += "\n请判断当前消息应该归属于哪个主题？如果不属于任何候选主题，请回答'新主题'。只需回答主题编号或'新主题'。"
    
    # 调用LLM
    response = await call_llm(prompt)
    
    # 解析响应
    if "新主题" in response:
        return None
    
    try:
        # 尝试提取主题编号
        match = re.search(r'(\d+)', response)
        if match:
            topic_index = int(match.group(1)) - 1
            if 0 <= topic_index < len(topic_candidates):
                return topic_candidates[topic_index][0].topic_id
    except Exception as e:
        logger.error(f"解析LLM响应失败: {str(e)}")
    
    # 如果无法解析，返回相似度最高的主题
    if topic_candidates:
        return topic_candidates[0][0].topic_id
    
    return None
```

### 2.4 短期记忆召回

短期记忆召回是根据当前对话上下文，检索相关的历史消息的过程。

#### 2.4.1 基于回复链的召回

```python
async def retrieve_reply_chain(message_id: str, max_depth: int = 5) -> List[Message]:
    """
    基于回复链检索消息
    
    Args:
        message_id: 消息ID
        max_depth: 最大深度
        
    Returns:
        List[Message]: 消息列表
    """
    messages = []
    current_id = message_id
    depth = 0
    
    while current_id and depth < max_depth:
        # 从缓存或数据库获取消息
        message = await get_message(current_id)
        if not message:
            break
        
        messages.append(message)
        current_id = message.reply_message_id
        depth += 1
    
    # 按时间顺序排序
    messages.sort(key=lambda x: x.create_time)
    
    return messages
```

#### 2.4.2 基于主题的召回

```python
async def retrieve_topic_messages(topic_id: str, limit: int = 20) -> List[Message]:
    """
    基于主题检索消息
    
    Args:
        topic_id: 主题ID
        limit: 最大消息数
        
    Returns:
        List[Message]: 消息列表
    """
    # 从数据库检索主题相关消息
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT m.*
            FROM messages m
            JOIN topic_messages tm ON m.message_id = tm.message_id
            WHERE tm.topic_id = $1
            ORDER BY m.create_time DESC
            LIMIT $2
            """,
            topic_id, limit
        )
    
    # 构建消息对象
    messages = []
    for row in rows:
        message = Message(
            message_id=row["message_id"],
            chat_id=row["chat_id"],
            user_id=row["user_id"],
            user_name=row["user_name"],
            content=row["content"],
            role=row["role"],
            is_mention_bot=row["is_mention_bot"],
            root_message_id=row["root_message_id"],
            reply_message_id=row["reply_message_id"],
            topic_id=row["topic_id"],
            create_time=row["create_time"]
        )
        messages.append(message)
    
    # 按时间顺序排序
    messages.sort(key=lambda x: x.create_time)
    
    return messages
```

#### 2.4.3 综合召回策略

```python
async def retrieve_short_term_memory(
    message: Message, 
    max_messages: int = 20
) -> List[Message]:
    """
    综合召回短期记忆
    
    Args:
        message: 当前消息
        max_messages: 最大消息数
        
    Returns:
        List[Message]: 消息列表
    """
    result_messages = set()
    
    # 1. 基于回复链召回
    if message.reply_message_id:
        reply_chain = await retrieve_reply_chain(message.reply_message_id)
        result_messages.update(reply_chain)
    
    # 2. 基于主题召回
    topic_id = await get_message_topic(message.message_id)
    if topic_id:
        topic_messages = await retrieve_topic_messages(topic_id)
        result_messages.update(topic_messages)
    
    # 3. 如果消息数不足，基于时间窗口召回
    if len(result_messages) < max_messages:
        recent_messages = await retrieve_recent_messages(
            message.chat_id, 
            limit=max_messages - len(result_messages)
        )
        result_messages.update(recent_messages)
    
    # 转换为列表并按时间排序
    messages_list = list(result_messages)
    messages_list.sort(key=lambda x: x.create_time)
    
    # 如果消息数超过限制，进行截断
    if len(messages_list) > max_messages:
        messages_list = messages_list[-max_messages:]
    
    return messages_list
```

### 2.5 短期记忆管理

#### 2.5.1 消息存储

```python
async def store_message(message: Message):
    """
    存储消息
    
    Args:
        message: 消息对象
    """
    # 生成消息向量
    if not message.content_vector:
        message.content_vector = await get_embedding(message.content)
    
    # 准备存储到Qdrant的数据
    message_payload = {
        "message_id": message.message_id,
        "chat_id": message.chat_id,
        "user_id": message.user_id,
        "user_name": message.user_name,
        "content": message.content,
        "role": message.role,
        "is_mention_bot": message.is_mention_bot,
        "root_message_id": message.root_message_id,
        "reply_message_id": message.reply_message_id,
        "topic_id": message.topic_id,
        "create_time": message.create_time.isoformat()
    }
    
    # 存储到Qdrant
    await qdrant_client.upsert(
        collection_name="messages",
        points=[
            PointStruct(
                id=message.message_id,
                vector=message.content_vector,
                payload=message_payload
            )
        ]
    )
    
    # 缓存最近消息
    await cache_recent_message(message)
    
    # 异步分类消息主题
    background_tasks.add_task(classify_message_topic, message)
```

#### 2.5.2 缓存策略

```python
async def cache_recent_message(message: Message):
    """
    缓存最近消息
    
    Args:
        message: 消息对象
    """
    # 序列化消息
    message_data = json.dumps({
        "message_id": message.message_id,
        "chat_id": message.chat_id,
        "user_id": message.user_id,
        "user_name": message.user_name,
        "content": message.content,
        "role": message.role,
        "is_mention_bot": message.is_mention_bot,
        "root_message_id": message.root_message_id,
        "reply_message_id": message.reply_message_id,
        "topic_id": message.topic_id,
        "create_time": message.create_time.isoformat()
    })
    
    # 缓存消息
    await redis.set(f"message:{message.message_id}", message_data, ex=86400)  # 24小时过期
    
    # 添加到聊天最近消息列表
    await redis.zadd(
        f"chat:{message.chat_id}:messages", 
        {message.message_id: message.create_time.timestamp()}
    )
    
    # 设置聊天最近消息列表过期时间
    await redis.expire(f"chat:{message.chat_id}:messages", 86400)  # 24小时过期
    
    # 修剪列表，只保留最近100条消息
    await redis.zremrangebyrank(f"chat:{message.chat_id}:messages", 0, -101)
```

## 3. 中期记忆实现

中期记忆主要存储主题摘要信息，用于特定主题的深度检索。

### 3.1 数据结构设计

#### 3.1.1 主题摘要结构

```python
class TopicSummary(BaseModel):
    summary_id: str                  # 摘要ID
    topic_id: str                    # 主题ID
    content: str                     # 摘要内容
    metadata: Optional[Dict] = None  # 元数据
    summary_vector: Optional[List[float]] = None  # 摘要的向量表示
    create_time: datetime            # 创建时间
    update_time: datetime            # 更新时间
    version: int = 1                 # 版本号
```

#### 3.1.2 主题关键词结构

```python
class TopicKeyword(BaseModel):
    topic_id: str                    # 主题ID
    keyword: str                     # 关键词
    weight: float                    # 权重
    create_time: datetime            # 创建时间
```

### 3.2 摘要生成流程

#### 3.2.1 摘要生成触发机制

摘要生成可以通过以下方式触发：

1. **主题关闭触发**：当主题被标记为非活跃时，触发摘要生成。
2. **消息数量触发**：当主题的消息数量达到一定阈值时，触发摘要生成。
3. **定时触发**：定期对活跃主题生成摘要。
4. **手动触发**：通过API手动触发摘要生成。

#### 3.2.2 摘要生成算法

```python
async def generate_topic_summary(topic_id: str) -> Optional[TopicSummary]:
    """
    生成主题摘要
    
    Args:
        topic_id: 主题ID
        
    Returns:
        Optional[TopicSummary]: 主题摘要
    """
    # 获取主题信息
    topic = await get_topic(topic_id)
    if not topic:
        logger.error(f"主题不存在: {topic_id}")
        return None
    
    # 获取主题消息
    messages = await retrieve_topic_messages(topic_id, limit=100)
    if not messages:
        logger.warning(f"主题没有消息: {topic_id}")
        return None
    
    try:
        # 1. 消息预处理
        processed_messages = preprocess_messages(messages)
        
        # 2. 智能分段
        segments = segment_messages(processed_messages)
        
        # 3. 分段摘要生成
        segment_summaries = []
        for segment in segments:
            summary = await generate_segment_summary(segment, topic.title)
            segment_summaries.append(summary)
        
        # 4. 摘要合并与优化
        merged_summary = await merge_summaries(segment_summaries, topic.title)
        
        # 5. 多维度信息提取
        metadata = extract_summary_metadata(merged_summary, messages)
        
        # 6. 生成摘要向量
        summary_vector = await get_embedding(merged_summary)
        
        # 创建摘要对象
        now = datetime.now()
        summary = TopicSummary(
            summary_id=str(uuid.uuid4()),
            topic_id=topic_id,
            content=merged_summary,
            metadata=metadata,
            summary_vector=summary_vector,
            create_time=now,
            update_time=now,
            version=1
        )
        
        # 存储摘要
        await store_topic_summary(summary)
        
        # 提取并存储关键词
        keywords = extract_keywords(merged_summary, messages)
        await store_topic_keywords(topic_id, keywords)
        
        return summary
    
    except Exception as e:
        logger.error(f"生成主题摘要失败: {str(e)}")
        
        # 备用策略：使用简单摘要
        try:
            simple_summary = await generate_simple_summary(messages, topic.title)
            
            # 创建摘要对象
            now = datetime.now()
            summary = TopicSummary(
                summary_id=str(uuid.uuid4()),
                topic_id=topic_id,
                content=simple_summary,
                metadata={"generation_method": "simple"},
                summary_vector=await get_embedding(simple_summary),
                create_time=now,
                update_time=now,
                version=1
            )
            
            # 存储摘要
            await store_topic_summary(summary)
            
            return summary
        
        except Exception as backup_error:
            logger.error(f"生成简单摘要也失败: {str(backup_error)}")
            return None
```

#### 3.2.3 摘要质量评估

```python
async def evaluate_summary_quality(
    summary: str, 
    messages: List[Message], 
    topic_title: str
) -> Dict:
    """
    评估摘要质量
    
    Args:
        summary: 摘要内容
        messages: 消息列表
        topic_title: 主题标题
        
    Returns:
        Dict: 质量评估结果
    """
    # 1. 计算覆盖率
    coverage_score = calculate_coverage(summary, messages)
    
    # 2. 计算连贯性
    coherence_score = calculate_coherence(summary)
    
    # 3. 计算相关性
    relevance_score = calculate_relevance(summary, topic_title)
    
    # 4. 使用LLM评估摘要质量
    llm_evaluation = await llm_evaluate_summary(summary, messages, topic_title)
    
    # 5. 综合评分
    overall_score = (
        coverage_score * 0.3 + 
        coherence_score * 0.2 + 
        relevance_score * 0.2 + 
        llm_evaluation.get("score", 0.0) * 0.3
    )
    
    return {
        "coverage": coverage_score,
        "coherence": coherence_score,
        "relevance": relevance_score,
        "llm_evaluation": llm_evaluation,
        "overall_score": overall_score
    }
```

### 3.3 中期记忆检索

#### 3.3.1 关键词检索

```python
async def search_by_keywords(
    query: str, 
    chat_id: Optional[str] = None,
    user_id: Optional[str] = None,
    limit: int = 10
) -> List[Dict]:
    """
    基于关键词检索主题摘要
    
    Args:
        query: 查询关键词
        chat_id: 聊天ID（可选）
        user_id: 用户ID（可选，透传）
        limit: 最大结果数
        
    Returns:
        List[Dict]: 检索结果
    """
    # 提取查询关键词
    keywords = extract_query_keywords(query)
    
    # 构建查询条件
    conditions = []
    params = []
    param_index = 1
    
    # 添加关键词条件
    keyword_conditions = []
    for keyword in keywords:
        keyword_conditions.append(f"tk.keyword ILIKE ${param_index}")
        params.append(f"%{keyword}%")
        param_index += 1
    
    if keyword_conditions:
        conditions.append("(" + " OR ".join(keyword_conditions) + ")")
    
    # 添加聊天ID条件
    if chat_id:
        conditions.append(f"t.chat_id = ${param_index}")
        params.append(chat_id)
        param_index += 1
    
    # 构建查询SQL
    sql = """
    SELECT DISTINCT ts.topic_id, ts.summary_id, ts.content, ts.metadata,
           t.title AS topic_title, t.chat_id
    FROM topic_summaries ts
    JOIN topics t ON ts.topic_id = t.topic_id
    JOIN topic_keywords tk ON ts.topic_id = tk.topic_id
    """
    
    if conditions:
        sql += " WHERE " + " AND ".join(conditions)
    
    sql += """
    ORDER BY ts.update_time DESC
    LIMIT ${}
    """.format(param_index)
    
    # 执行查询
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *params)
    
    # 处理结果
    results = []
    for row in rows:
        results.append({
            "topic_id": row["topic_id"],
            "summary_id": row["summary_id"],
            "content": row["content"],
            "metadata": row["metadata"],
            "topic_title": row["topic_title"],
            "chat_id": row["chat_id"]
        })
    
    return results
```

#### 3.3.2 向量检索

```python
async def search_by_vector(
    query: str, 
    chat_id: Optional[str] = None,
    user_id: Optional[str] = None,
    limit: int = 10
) -> List[Dict]:
    """
    基于向量检索主题摘要
    
    Args:
        query: 查询文本
        chat_id: 聊天ID（可选）
        user_id: 用户ID（可选，透传）
        limit: 最大结果数
        
    Returns:
        List[Dict]: 检索结果
    """
    # 生成查询向量
    query_vector = await get_embedding(query)
    
    # 构建Qdrant查询过滤条件
    filter_conditions = {}
    if chat_id:
        filter_conditions["chat_id"] = chat_id
    
    # 执行Qdrant查询
    search_result = await qdrant_client.search(
        collection_name="topic_summaries",
        query_vector=query_vector,
        limit=limit,
        filter=filter_conditions if filter_conditions else None
    )
    
    # 处理结果
    results = []
    for hit in search_result:
        # 从payload中提取数据
        payload = hit.payload
        results.append({
            "topic_id": payload.get("topic_id"),
            "summary_id": payload.get("summary_id"),
            "content": payload.get("content"),
            "metadata": payload.get("metadata", {}),
            "topic_title": payload.get("topic_title"),
            "chat_id": payload.get("chat_id"),
            "relevance": hit.score  # Qdrant返回的相似度分数
        })
    
    return results
```

#### 3.3.3 混合检索策略

```python
async def search_mid_term_memory(
    query: str, 
    chat_id: Optional[str] = None,
    user_id: Optional[str] = None,
    limit: int = 10
) -> List[Dict]:
    """
    混合检索中期记忆
    
    Args:
        query: 查询文本
        chat_id: 聊天ID（可选）
        user_id: 用户ID（可选，透传）
        limit: 最大结果数
        
    Returns:
        List[Dict]: 检索结果
    """
    # 1. 关键词检索
    keyword_results = await search_by_keywords(query, chat_id, user_id, limit=limit*2)
    
    # 2. 向量检索
    vector_results = await search_by_vector(query, chat_id, user_id, limit=limit*2)
    
    # 3. 结果融合
    # 创建ID到结果的映射
    result_map = {}
    
    # 处理关键词结果
    for i, result in enumerate(keyword_results):
        result_id = f"{result['topic_id']}:{result['summary_id']}"
        result["keyword_rank"] = i + 1
        result["keyword_score"] = 1.0 / (i + 1)
        result_map[result_id] = result
    
    # 处理向量结果
    for i, result in enumerate(vector_results):
        result_id = f"{result['topic_id']}:{result['summary_id']}"
        result["vector_rank"] = i + 1
        result["vector_score"] = result["relevance"]
        
        if result_id in result_map:
            # 更新已有结果
            result_map[result_id].update({
                "vector_rank": result["vector_rank"],
                "vector_score": result["vector_score"]
            })
        else:
            # 添加新结果
            result["keyword_rank"] = limit * 2 + 1
            result["keyword_score"] = 0.0
            result_map[result_id] = result
    
    # 计算综合得分
    results = list(result_map.values())
    for result in results:
        result["combined_score"] = (
            result.get("keyword_score", 0.0) * 0.4 + 
            result.get("vector_score", 0.0) * 0.6
        )
    
    # 按综合得分排序
    results.sort(key=lambda x: x["combined_score"], reverse=True)
    
    # 截取前limit个结果
    return results[:limit]
```

### 3.4 原始消息保留和访问

#### 3.4.1 原始消息存储

原始消息存储在消息表中，通过主题消息关联表与主题关联。

#### 3.4.2 按需查询机制

```python
async def retrieve_original_messages(
    topic_id: str, 
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    limit: int = 100
) -> List[Message]:
    """
    按需查询原始消息
    
    Args:
        topic_id: 主题ID
        start_time: 开始时间（可选）
        end_time: 结束时间（可选）
        limit: 最大消息数
        
    Returns:
        List[Message]: 消息列表
    """
    # 构建Qdrant查询过滤条件
    filter_conditions = {
        "topic_id": topic_id
    }
    
    if start_time:
        filter_conditions["create_time"] = {
            "$gte": start_time.isoformat()
        }
    
    if end_time:
        if "create_time" in filter_conditions:
            filter_conditions["create_time"]["$lte"] = end_time.isoformat()
        else:
            filter_conditions["create_time"] = {
                "$lte": end_time.isoformat()
            }
    
    # 执行Qdrant查询
    search_result = await qdrant_client.search(
        collection_name="topic_messages",
        query_filter=filter_conditions,
        limit=limit,
        with_payload=True,
        with_vectors=False
    )
    
    # 获取消息ID列表
    message_ids = [hit.payload.get("message_id") for hit in search_result]
    
    if not message_ids:
        return []
    
    # 查询消息详情
    message_results = await qdrant_client.search(
        collection_name="messages",
        query_filter={
            "message_id": {
                "$in": message_ids
            }
        },
        limit=len(message_ids),
        with_payload=True,
        with_vectors=False
    )
    
    # 构建消息对象
    messages = []
    for hit in message_results:
        payload = hit.payload
        message = Message(
            message_id=payload.get("message_id"),
            chat_id=payload.get("chat_id"),
            user_id=payload.get("user_id"),
            user_name=payload.get("user_name"),
            content=payload.get("content"),
            role=payload.get("role"),
            is_mention_bot=payload.get("is_mention_bot", False),
            root_message_id=payload.get("root_message_id"),
            reply_message_id=payload.get("reply_message_id"),
            topic_id=payload.get("topic_id"),
            create_time=datetime.fromisoformat(payload.get("create_time"))
        )
        messages.append(message)
    
    # 按时间排序
    messages.sort(key=lambda x: x.create_time)
    
    return messages
```

## 4. 长期记忆实现

长期记忆主要存储结构化的知识和用户画像，用于快速检索和特定主题的深度检索。

### 4.1 结构化信息提取

#### 4.1.1 实体提取

```python
async def extract_entities(messages: List[Message]) -> List[Dict]:
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
    response = await call_llm(prompt)
    
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

#### 4.1.2 关系提取

```python
async def extract_relations(
    messages: List[Message], 
    entities: List[Dict]
) -> List[Dict]:
    """
    从消息中提取实体间的关系
    
    Args:
        messages: 消息列表
        entities: 实体列表
        
    Returns:
        List[Dict]: 关系列表
    """
    if not entities or len(entities) < 2:
        return []
    
    # 构建提示
    conversation = []
    for message in messages:
        conversation.append({
            "role": message.role,
            "content": message.content,
            "user_name": message.user_name
        })
    
    prompt = f"""
    从以下对话中提取实体间的关系：
    
    对话内容：
    {json.dumps(conversation, ensure_ascii=False, indent=2)}
    
    已识别的实体：
    {json.dumps(entities, ensure_ascii=False, indent=2)}
    
    请以JSON格式返回实体间的关系列表，包含以下字段：
    - source_entity: 源实体名称
    - target_entity: 目标实体名称
    - relation_type: 关系类型
    - description: 关系描述
    - confidence: 置信度（0-1之间的浮点数）
    
    只提取对话中明确提及且可信的关系，忽略推测性或模糊的关系。
    """
    
    # 调用LLM
    response = await call_llm(prompt)
    
    # 解析响应
    try:
        # 尝试直接解析JSON
        relations = json.loads(response)
    except json.JSONDecodeError:
        # 如果直接解析失败，尝试从文本中提取JSON部分
        match = re.search(r'```json\n(.*?)\n```', response, re.DOTALL)
        if match:
            try:
                relations = json.loads(match.group(1))
            except json.JSONDecodeError:
                logger.error("解析关系JSON失败")
                return []
        else:
            logger.error("响应中未找到JSON")
            return []
    
    # 验证和清理关系
    valid_relations = []
    entity_names = {entity["entity_name"] for entity in entities}
    
    for relation in relations:
        if (isinstance(relation, dict) and 
            "source_entity" in relation and 
            "target_entity" in relation and 
            "relation_type" in relation):
            
            # 检查源实体和目标实体是否在实体列表中
            if relation["source_entity"] in entity_names and relation["target_entity"] in entity_names:
                # 确保必要字段存在
                relation = {
                    "source_entity": relation["source_entity"],
                    "target_entity": relation["target_entity"],
                    "relation_type": relation["relation_type"],
                    "description": relation.get("description", ""),
                    "confidence": relation.get("confidence", 0.8)
                }
                valid_relations.append(relation)
    
    return valid_relations
```

#### 4.1.3 用户画像构建

```python
async def build_user_profile(user_id: str, user_name: str, messages: List[Message]) -> Dict:
    """
    构建用户画像
    
    Args:
        user_id: 用户ID（透传）
        user_name: 用户名（透传）
        messages: 用户的消息列表
        
    Returns:
        Dict: 用户画像
    """
    if not messages:
        return {
            "user_id": user_id,
            "profile_text": "",
            "preferences": [],
            "traits": []
        }
    
    # 过滤出用户的消息
    user_messages = [msg for msg in messages if msg.user_id == user_id and msg.role == "user"]
    
    if not user_messages:
        return {
            "user_id": user_id,
            "profile_text": "",
            "preferences": [],
            "traits": []
        }
    
    # 构建提示
    conversation = []
    for message in user_messages:
        conversation.append(message.content)
    
    prompt = f"""
    根据以下用户消息，构建用户画像：
    
    用户名: {user_name}
    消息:
    {json.dumps(conversation, ensure_ascii=False, indent=2)}
    
    请以JSON格式返回用户画像，包含以下字段：
    - profile_text: 用户画像文本描述
    - preferences: 用户偏好列表，每个偏好包含key、value和confidence
    - traits: 用户特质列表，每个特质包含trait_name和confidence
    
    只包含从消息中明确体现的信息，不要过度推测。
    """
    
    # 调用LLM
    response = await call_llm(prompt)
    
    # 解析响应
    try:
        # 尝试直接解析JSON
        profile = json.loads(response)
    except json.JSONDecodeError:
        # 如果直接解析失败，尝试从文本中提取JSON部分
        match = re.search(r'```json\n(.*?)\n```', response, re.DOTALL)
        if match:
            try:
                profile = json.loads(match.group(1))
            except json.JSONDecodeError:
                logger.error("解析用户画像JSON失败")
                return {
                    "user_id": user_id,
                    "profile_text": "",
                    "preferences": [],
                    "traits": []
                }
        else:
            logger.error("响应中未找到JSON")
            return {
                "user_id": user_id,
                "profile_text": "",
                "preferences": [],
                "traits": []
            }
    
    # 添加用户ID
    profile["user_id"] = user_id
    
    # 确保必要字段存在
    if "profile_text" not in profile:
        profile["profile_text"] = ""
    if "preferences" not in profile:
        profile["preferences"] = []
    if "traits" not in profile:
        profile["traits"] = []
    
    return profile
```

### 4.2 长期记忆检索

#### 4.2.1 实体检索

```python
async def search_entities(
    query: str, 
    entity_types: Optional[List[str]] = None,
    limit: int = 10
) -> List[Dict]:
    """
    检索实体
    
    Args:
        query: 查询文本
        entity_types: 实体类型列表（可选）
        limit: 最大结果数
        
    Returns:
        List[Dict]: 实体列表
    """
    # 生成查询向量
    query_vector = await get_embedding(query)
    
    # 构建Qdrant查询过滤条件
    filter_conditions = {}
    if entity_types:
        filter_conditions["entity_type"] = {
            "$in": entity_types
        }
    
    # 执行Qdrant查询
    search_result = await qdrant_client.search(
        collection_name="entities",
        query_vector=query_vector,
        limit=limit,
        filter=filter_conditions if filter_conditions else None
    )
    
    # 处理结果
    results = []
    for hit in search_result:
        # 从payload中提取数据
        payload = hit.payload
        results.append({
            "entity_id": payload.get("entity_id"),
            "entity_name": payload.get("entity_name"),
            "entity_type": payload.get("entity_type"),
            "metadata": payload.get("metadata", {}),
            "relevance": hit.score  # Qdrant返回的相似度分数
        })
    
    return results
```

#### 4.2.2 用户画像检索

```python
async def get_user_profile(user_id: str) -> Optional[Dict]:
    """
    获取用户画像
    
    Args:
        user_id: 用户ID（透传）
        
    Returns:
        Optional[Dict]: 用户画像
    """
    # 从缓存获取
    cache_key = f"user_profile:{user_id}"
    cached_profile = await redis.get(cache_key)
    
    if cached_profile:
        return json.loads(cached_profile)
    
    # 从Qdrant获取用户画像
    search_result = await qdrant_client.search(
        collection_name="user_profiles",
        query_filter={
            "user_id": user_id
        },
        limit=1
    )
    
    if not search_result:
        return None
    
    # 从payload中提取数据
    payload = search_result[0].payload
    
    # 获取用户偏好（从Qdrant中获取）
    pref_results = await qdrant_client.search(
        collection_name="user_preferences",
        query_filter={
            "user_id": user_id
        },
        limit=100  # 假设用户偏好不会超过100个
    )
    
    preferences = []
    for pref in pref_results:
        pref_payload = pref.payload
        preferences.append({
            "key": pref_payload.get("preference_key"),
            "value": pref_payload.get("preference_value"),
            "confidence": pref_payload.get("confidence", 0.8)
        })
    
    # 构建用户画像
    profile = {
        "user_id": user_id,
        "profile_text": payload.get("profile_text", ""),
        "preferences": preferences,
        "create_time": payload.get("create_time", ""),
        "update_time": payload.get("update_time", "")
    }
    
    # 缓存用户画像
    await redis.set(cache_key, json.dumps(profile), ex=3600)  # 1小时过期
    
    return profile
```

#### 4.2.3 知识图谱查询

```python
async def query_knowledge_graph(
    entity_name: str, 
    max_depth: int = 2,
    relation_types: Optional[List[str]] = None
) -> Dict:
    """
    查询知识图谱
    
    Args:
        entity_name: 实体名称
        max_depth: 最大深度
        relation_types: 关系类型列表（可选）
        
    Returns:
        Dict: 知识图谱
    """
    # 查找实体
    entity_results = await qdrant_client.search(
        collection_name="entities",
        query_filter={
            "entity_name": entity_name
        },
        limit=1
    )
    
    if not entity_results:
        return {"nodes": [], "edges": []}
    
    # 获取实体信息
    entity_payload = entity_results[0].payload
    entity_id = entity_payload.get("entity_id")
    
    # 初始化结果
    nodes = [{
        "id": entity_id,
        "name": entity_payload.get("entity_name"),
        "type": entity_payload.get("entity_type"),
        "metadata": entity_payload.get("metadata", {})
    }]
    edges = []
    
    # 已处理的实体ID
    processed_entities = {entity_id}
    
    # 待处理的实体队列
    queue = [(entity_id, 0)]  # (entity_id, depth)
    
    while queue:
        current_id, depth = queue.pop(0)
        
        if depth >= max_depth:
            continue
        
        # 查询关系
        relation_filter = {
            "source_entity_id": current_id
        }
        
        if relation_types:
            relation_filter["relation_type"] = {
                "$in": relation_types
            }
        
        relation_results = await qdrant_client.search(
            collection_name="relations",
            query_filter=relation_filter,
            limit=100  # 假设每个实体的关系不会超过100个
        )
        
        for relation_hit in relation_results:
            relation_payload = relation_hit.payload
            target_id = relation_payload.get("target_entity_id")
            
            # 添加关系
            edges.append({
                "id": relation_payload.get("relation_id"),
                "source": relation_payload.get("source_entity_id"),
                "target": target_id,
                "type": relation_payload.get("relation_type"),
                "metadata": relation_payload.get("metadata", {})
            })
            
            # 如果目标实体未处理，添加到节点列表和队列
            if target_id not in processed_entities:
                processed_entities.add(target_id)
                
                # 获取目标实体信息
                target_results = await qdrant_client.search(
                    collection_name="entities",
                    query_filter={
                        "entity_id": target_id
                    },
                    limit=1
                )
                
                if target_results:
                    target_payload = target_results[0].payload
                    nodes.append({
                        "id": target_payload.get("entity_id"),
                        "name": target_payload.get("entity_name"),
                        "type": target_payload.get("entity_type"),
                        "metadata": target_payload.get("metadata", {})
                    })
                    
                    # 添加到队列
                    queue.append((target_id, depth + 1))
    
    return {"nodes": nodes, "edges": edges}
```

### 4.3 长期记忆更新和演化

#### 4.3.1 增量更新机制

```python
async def update_entity(entity_id: str, updates: Dict) -> bool:
    """
    更新实体
    
    Args:
        entity_id: 实体ID
        updates: 更新内容
        
    Returns:
        bool: 是否成功
    """
    # 验证实体是否存在
    entity_results = await qdrant_client.search(
        collection_name="entities",
        query_filter={
            "entity_id": entity_id
        },
        limit=1
    )
    
    if not entity_results:
        logger.error(f"实体不存在: {entity_id}")
        return False
    
    # 获取当前实体数据
    current_payload = entity_results[0].payload
    
    # 构建更新内容
    valid_updates = {}
    
    for field, value in updates.items():
        if field in ["entity_name", "entity_type", "metadata"]:
            valid_updates[field] = value
    
    if not valid_updates:
        logger.warning("没有有效的更新字段")
        return False
    
    # 添加更新时间
    valid_updates["update_time"] = datetime.now().isoformat()
    
    # 更新Qdrant中的实体
    updated_payload = {**current_payload, **valid_updates}
    
    # 执行更新
    await qdrant_client.update_payload(
        collection_name="entities",
        points_selector={"filter": {"entity_id": entity_id}},
        payload=updated_payload
    )
    
    return True
```

#### 4.3.2 冲突解决策略
