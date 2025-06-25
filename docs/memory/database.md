# 飞书闲聊记忆框架存储方案

## 1. 概述

本文档详细描述了飞书闲聊记忆框架的存储方案设计，包括数据模型、索引策略、存储技术选型和性能优化设计。该方案基于三层记忆模型（短期记忆、中期记忆和长期记忆）和AI驱动算法的需求，设计了高效、可扩展、安全的存储解决方案。

## 2. 数据模型设计

### 2.1 短期记忆数据模型

短期记忆主要存储最近的原始对话内容，包括消息、主题和会话等信息。用户ID和用户名仅作为消息的属性直接存储，不做映射。

#### 2.1.1 消息表 (messages)

```sql
CREATE TABLE messages (
    message_id VARCHAR(64) PRIMARY KEY,  -- 消息ID
    chat_id VARCHAR(64) NOT NULL,        -- 聊天ID
    user_id VARCHAR(64) NOT NULL,        -- 用户ID（透传，不存储用户信息）
    user_name VARCHAR(128) NOT NULL,     -- 用户名（透传，不存储用户信息）
    content TEXT NOT NULL,               -- 消息内容
    content_vector VECTOR(1536),         -- 消息内容的向量表示
    role VARCHAR(16) NOT NULL,           -- 角色：user 或 assistant
    is_mention_bot BOOLEAN DEFAULT FALSE, -- 是否@机器人
    root_message_id VARCHAR(64),         -- 根消息ID
    reply_message_id VARCHAR(64),        -- 回复消息ID
    topic_id VARCHAR(64),                -- 主题ID
    create_time TIMESTAMP NOT NULL,      -- 创建时间
    FOREIGN KEY (chat_id) REFERENCES chats(chat_id),
    FOREIGN KEY (topic_id) REFERENCES topics(topic_id)
);

CREATE INDEX idx_messages_chat_id ON messages(chat_id);
CREATE INDEX idx_messages_topic_id ON messages(topic_id);
CREATE INDEX idx_messages_user_id ON messages(user_id);
CREATE INDEX idx_messages_create_time ON messages(create_time);
CREATE INDEX idx_messages_root_message_id ON messages(root_message_id);
CREATE INDEX idx_messages_reply_message_id ON messages(reply_message_id);
```

#### 2.1.2 主题表 (topics)

```sql
CREATE TABLE topics (
    topic_id VARCHAR(64) PRIMARY KEY,    -- 主题ID
    title VARCHAR(256) NOT NULL,         -- 主题标题
    description TEXT,                    -- 主题描述
    creator_id VARCHAR(64) NOT NULL,     -- 创建者ID（透传，不存储用户信息）
    chat_id VARCHAR(64) NOT NULL,        -- 聊天ID
    keywords JSONB,                      -- 主题关键词
    topic_vector VECTOR(1536),           -- 主题的向量表示
    create_time TIMESTAMP NOT NULL,      -- 创建时间
    update_time TIMESTAMP NOT NULL,      -- 更新时间
    is_active BOOLEAN DEFAULT TRUE,      -- 是否活跃
    is_archived BOOLEAN DEFAULT FALSE,   -- 是否归档
    FOREIGN KEY (chat_id) REFERENCES chats(chat_id)
);

CREATE INDEX idx_topics_chat_id ON topics(chat_id);
CREATE INDEX idx_topics_creator_id ON topics(creator_id);
CREATE INDEX idx_topics_create_time ON topics(create_time);
CREATE INDEX idx_topics_is_active ON topics(is_active);
CREATE INDEX idx_topics_keywords ON topics USING gin(keywords);
```

#### 2.1.3 主题消息关联表 (topic_messages)

```sql
CREATE TABLE topic_messages (
    topic_id VARCHAR(64) NOT NULL,       -- 主题ID
    message_id VARCHAR(64) NOT NULL,     -- 消息ID
    relevance_score FLOAT,               -- 相关性得分
    create_time TIMESTAMP NOT NULL,      -- 创建时间
    PRIMARY KEY (topic_id, message_id),
    FOREIGN KEY (topic_id) REFERENCES topics(topic_id),
    FOREIGN KEY (message_id) REFERENCES messages(message_id)
);

CREATE INDEX idx_topic_messages_topic_id ON topic_messages(topic_id);
CREATE INDEX idx_topic_messages_message_id ON topic_messages(message_id);
CREATE INDEX idx_topic_messages_relevance_score ON topic_messages(relevance_score);
```

#### 2.1.4 会话表 (chats)

```sql
CREATE TABLE chats (
    chat_id VARCHAR(64) PRIMARY KEY,     -- 聊天ID
    chat_type VARCHAR(16) NOT NULL,      -- 聊天类型：p2p 或 group
    title VARCHAR(256),                  -- 聊天标题
    creator_id VARCHAR(64) NOT NULL,     -- 创建者ID（透传，不存储用户信息）
    create_time TIMESTAMP NOT NULL,      -- 创建时间
    update_time TIMESTAMP NOT NULL       -- 更新时间
);

CREATE INDEX idx_chats_chat_type ON chats(chat_type);
CREATE INDEX idx_chats_creator_id ON chats(creator_id);
CREATE INDEX idx_chats_create_time ON chats(create_time);
```

### 2.2 中期记忆数据模型

中期记忆主要存储主题摘要信息，包括主题摘要、主题关键词和主题实体等。

#### 2.2.1 主题摘要表 (topic_summaries)

```sql
CREATE TABLE topic_summaries (
    summary_id VARCHAR(64) PRIMARY KEY,  -- 摘要ID
    topic_id VARCHAR(64) NOT NULL,       -- 主题ID
    content TEXT NOT NULL,               -- 摘要内容
    metadata JSONB,                      -- 元数据
    summary_vector VECTOR(1536),         -- 摘要的向量表示
    create_time TIMESTAMP NOT NULL,      -- 创建时间
    update_time TIMESTAMP NOT NULL,      -- 更新时间
    version INT NOT NULL DEFAULT 1,      -- 版本号
    FOREIGN KEY (topic_id) REFERENCES topics(topic_id)
);

CREATE INDEX idx_topic_summaries_topic_id ON topic_summaries(topic_id);
CREATE INDEX idx_topic_summaries_create_time ON topic_summaries(create_time);
CREATE INDEX idx_topic_summaries_version ON topic_summaries(version);
```

#### 2.2.2 主题关键词表 (topic_keywords)

```sql
CREATE TABLE topic_keywords (
    topic_id VARCHAR(64) NOT NULL,       -- 主题ID
    keyword VARCHAR(128) NOT NULL,       -- 关键词
    weight FLOAT NOT NULL,               -- 权重
    create_time TIMESTAMP NOT NULL,      -- 创建时间
    PRIMARY KEY (topic_id, keyword),
    FOREIGN KEY (topic_id) REFERENCES topics(topic_id)
);

CREATE INDEX idx_topic_keywords_topic_id ON topic_keywords(topic_id);
CREATE INDEX idx_topic_keywords_keyword ON topic_keywords(keyword);
CREATE INDEX idx_topic_keywords_weight ON topic_keywords(weight);
```

#### 2.2.3 主题实体表 (topic_entities)

```sql
CREATE TABLE topic_entities (
    topic_id VARCHAR(64) NOT NULL,       -- 主题ID
    entity_id VARCHAR(64) NOT NULL,      -- 实体ID
    entity_type VARCHAR(32) NOT NULL,    -- 实体类型
    entity_name VARCHAR(256) NOT NULL,   -- 实体名称
    importance FLOAT NOT NULL,           -- 重要性
    create_time TIMESTAMP NOT NULL,      -- 创建时间
    PRIMARY KEY (topic_id, entity_id),
    FOREIGN KEY (topic_id) REFERENCES topics(topic_id),
    FOREIGN KEY (entity_id) REFERENCES entities(entity_id)
);

CREATE INDEX idx_topic_entities_topic_id ON topic_entities(topic_id);
CREATE INDEX idx_topic_entities_entity_id ON topic_entities(entity_id);
CREATE INDEX idx_topic_entities_entity_type ON topic_entities(entity_type);
CREATE INDEX idx_topic_entities_importance ON topic_entities(importance);
```

### 2.3 长期记忆数据模型

长期记忆主要存储结构化的知识和用户画像，包括实体、关系、属性、用户画像、用户偏好和用户社交关系等。

#### 2.3.1 实体表 (entities)

```sql
CREATE TABLE entities (
    entity_id VARCHAR(64) PRIMARY KEY,   -- 实体ID
    entity_name VARCHAR(256) NOT NULL,   -- 实体名称
    entity_type VARCHAR(32) NOT NULL,    -- 实体类型
    metadata JSONB,                      -- 元数据
    entity_vector VECTOR(1536),          -- 实体的向量表示
    create_time TIMESTAMP NOT NULL,      -- 创建时间
    update_time TIMESTAMP NOT NULL       -- 更新时间
);

CREATE INDEX idx_entities_entity_type ON entities(entity_type);
CREATE INDEX idx_entities_entity_name ON entities(entity_name);
CREATE INDEX idx_entities_create_time ON entities(create_time);
CREATE INDEX idx_entities_metadata ON entities USING gin(metadata);
```

#### 2.3.2 关系表 (relations)

```sql
CREATE TABLE relations (
    relation_id VARCHAR(64) PRIMARY KEY, -- 关系ID
    source_entity_id VARCHAR(64) NOT NULL, -- 源实体ID
    target_entity_id VARCHAR(64) NOT NULL, -- 目标实体ID
    relation_type VARCHAR(32) NOT NULL,  -- 关系类型
    metadata JSONB,                      -- 元数据
    confidence FLOAT NOT NULL,           -- 置信度
    create_time TIMESTAMP NOT NULL,      -- 创建时间
    update_time TIMESTAMP NOT NULL,      -- 更新时间
    FOREIGN KEY (source_entity_id) REFERENCES entities(entity_id),
    FOREIGN KEY (target_entity_id) REFERENCES entities(entity_id)
);

CREATE INDEX idx_relations_source_entity_id ON relations(source_entity_id);
CREATE INDEX idx_relations_target_entity_id ON relations(target_entity_id);
CREATE INDEX idx_relations_relation_type ON relations(relation_type);
CREATE INDEX idx_relations_confidence ON relations(confidence);
CREATE INDEX idx_relations_metadata ON relations USING gin(metadata);
```

#### 2.3.3 属性表 (attributes)

```sql
CREATE TABLE attributes (
    attribute_id VARCHAR(64) PRIMARY KEY, -- 属性ID
    entity_id VARCHAR(64) NOT NULL,      -- 实体ID
    attribute_name VARCHAR(128) NOT NULL, -- 属性名称
    attribute_value TEXT NOT NULL,       -- 属性值
    data_type VARCHAR(32) NOT NULL,      -- 数据类型
    confidence FLOAT NOT NULL,           -- 置信度
    create_time TIMESTAMP NOT NULL,      -- 创建时间
    update_time TIMESTAMP NOT NULL,      -- 更新时间
    FOREIGN KEY (entity_id) REFERENCES entities(entity_id)
);

CREATE INDEX idx_attributes_entity_id ON attributes(entity_id);
CREATE INDEX idx_attributes_attribute_name ON attributes(attribute_name);
CREATE INDEX idx_attributes_confidence ON attributes(confidence);
```

#### 2.3.4 事实表 (facts)

```sql
CREATE TABLE facts (
    fact_id VARCHAR(64) PRIMARY KEY,     -- 事实ID
    fact_text TEXT NOT NULL,             -- 事实文本
    source_type VARCHAR(32) NOT NULL,    -- 来源类型
    source_id VARCHAR(64) NOT NULL,      -- 来源ID
    confidence FLOAT NOT NULL,           -- 置信度
    fact_vector VECTOR(1536),            -- 事实的向量表示
    create_time TIMESTAMP NOT NULL,      -- 创建时间
    update_time TIMESTAMP NOT NULL       -- 更新时间
);

CREATE INDEX idx_facts_source_type ON facts(source_type);
CREATE INDEX idx_facts_source_id ON facts(source_id);
CREATE INDEX idx_facts_confidence ON facts(confidence);
CREATE INDEX idx_facts_create_time ON facts(create_time);
```

#### 2.3.5 事实实体关联表 (fact_entities)

```sql
CREATE TABLE fact_entities (
    fact_id VARCHAR(64) NOT NULL,        -- 事实ID
    entity_id VARCHAR(64) NOT NULL,      -- 实体ID
    role VARCHAR(32) NOT NULL,           -- 角色
    create_time TIMESTAMP NOT NULL,      -- 创建时间
    PRIMARY KEY (fact_id, entity_id, role),
    FOREIGN KEY (fact_id) REFERENCES facts(fact_id),
    FOREIGN KEY (entity_id) REFERENCES entities(entity_id)
);

CREATE INDEX idx_fact_entities_fact_id ON fact_entities(fact_id);
CREATE INDEX idx_fact_entities_entity_id ON fact_entities(entity_id);
CREATE INDEX idx_fact_entities_role ON fact_entities(role);
```

#### 2.3.6 用户画像表 (user_profiles)

```sql
CREATE TABLE user_profiles (
    user_id VARCHAR(64) PRIMARY KEY,     -- 用户ID（透传，不存储用户信息）
    profile_text TEXT,                   -- 画像文本
    profile_vector VECTOR(1536),         -- 画像的向量表示
    create_time TIMESTAMP NOT NULL,      -- 创建时间
    update_time TIMESTAMP NOT NULL       -- 更新时间
);

CREATE INDEX idx_user_profiles_create_time ON user_profiles(create_time);
```

注意：用户ID仅作为消息属性直接存储，不做映射。用户画像表中的user_id是从消息中透传的ID，系统不维护用户信息。

#### 2.3.7 用户偏好表 (user_preferences)

```sql
CREATE TABLE user_preferences (
    user_id VARCHAR(64) NOT NULL,        -- 用户ID（透传，不存储用户信息）
    preference_key VARCHAR(128) NOT NULL, -- 偏好键
    preference_value TEXT NOT NULL,      -- 偏好值
    confidence FLOAT NOT NULL,           -- 置信度
    create_time TIMESTAMP NOT NULL,      -- 创建时间
    update_time TIMESTAMP NOT NULL,      -- 更新时间
    PRIMARY KEY (user_id, preference_key),
    FOREIGN KEY (user_id) REFERENCES user_profiles(user_id)
);

CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);
CREATE INDEX idx_user_preferences_preference_key ON user_preferences(preference_key);
CREATE INDEX idx_user_preferences_confidence ON user_preferences(confidence);
```

注意：用户ID仅作为消息属性直接存储，不做映射。用户偏好表中的user_id是从消息中透传的ID。

#### 2.3.8 用户社交关系表 (user_social_relations)

```sql
CREATE TABLE user_social_relations (
    user_id VARCHAR(64) NOT NULL,        -- 用户ID（透传，不存储用户信息）
    related_user_id VARCHAR(64) NOT NULL, -- 关联用户ID（透传，不存储用户信息）
    relation_type VARCHAR(32) NOT NULL,  -- 关系类型
    metadata JSONB,                      -- 元数据
    confidence FLOAT NOT NULL,           -- 置信度
    create_time TIMESTAMP NOT NULL,      -- 创建时间
    update_time TIMESTAMP NOT NULL,      -- 更新时间
    PRIMARY KEY (user_id, related_user_id, relation_type),
    FOREIGN KEY (user_id) REFERENCES user_profiles(user_id)
);

CREATE INDEX idx_user_social_relations_user_id ON user_social_relations(user_id);
CREATE INDEX idx_user_social_relations_related_user_id ON user_social_relations(related_user_id);
CREATE INDEX idx_user_social_relations_relation_type ON user_social_relations(relation_type);
CREATE INDEX idx_user_social_relations_confidence ON user_social_relations(confidence);
```

注意：用户ID和关联用户ID仅作为消息属性直接存储，不做映射。社交关系表中的user_id和related_user_id是从消息中透传的ID。

### 2.4 记忆管理相关表

#### 2.4.1 记忆强度表 (memory_strengths)

```sql
CREATE TABLE memory_strengths (
    memory_id VARCHAR(64) NOT NULL,      -- 记忆ID
    memory_type VARCHAR(16) NOT NULL,    -- 记忆类型：message, topic, entity, fact, user_profile
    strength FLOAT NOT NULL,             -- 记忆强度
    last_access_time TIMESTAMP NOT NULL, -- 最后访问时间
    is_pinned BOOLEAN DEFAULT FALSE,     -- 是否固定
    create_time TIMESTAMP NOT NULL,      -- 创建时间
    update_time TIMESTAMP NOT NULL,      -- 更新时间
    PRIMARY KEY (memory_id, memory_type)
);

CREATE INDEX idx_memory_strengths_memory_type ON memory_strengths(memory_type);
CREATE INDEX idx_memory_strengths_strength ON memory_strengths(strength);
CREATE INDEX idx_memory_strengths_last_access_time ON memory_strengths(last_access_time);
CREATE INDEX idx_memory_strengths_is_pinned ON memory_strengths(is_pinned);
```

#### 2.4.2 记忆遗忘队列表 (forgetting_queue)

```sql
CREATE TABLE forgetting_queue (
    queue_id VARCHAR(64) PRIMARY KEY,    -- 队列ID
    memory_id VARCHAR(64) NOT NULL,      -- 记忆ID
    memory_type VARCHAR(16) NOT NULL,    -- 记忆类型：message, topic, entity, fact, user_profile
    priority INTEGER NOT NULL,           -- 优先级
    scheduled_time TIMESTAMP NOT NULL,   -- 计划执行时间
    status VARCHAR(16) NOT NULL,         -- 状态：pending, processing, completed, failed
    create_time TIMESTAMP NOT NULL,      -- 创建时间
    update_time TIMESTAMP NOT NULL       -- 更新时间
);

CREATE INDEX idx_forgetting_queue_memory_id ON forgetting_queue(memory_id);
CREATE INDEX idx_forgetting_queue_memory_type ON forgetting_queue(memory_type);
CREATE INDEX idx_forgetting_queue_priority ON forgetting_queue(priority);
CREATE INDEX idx_forgetting_queue_scheduled_time ON forgetting_queue(scheduled_time);
CREATE INDEX idx_forgetting_queue_status ON forgetting_queue(status);
```

#### 2.4.3 摘要生成队列表 (summary_queue)

```sql
CREATE TABLE summary_queue (
    queue_id VARCHAR(64) PRIMARY KEY,    -- 队列ID
    topic_id VARCHAR(64) NOT NULL,       -- 主题ID
    priority INTEGER NOT NULL,           -- 优先级
    scheduled_time TIMESTAMP NOT NULL,   -- 计划执行时间
    status VARCHAR(16) NOT NULL,         -- 状态：pending, processing, completed, failed
    create_time TIMESTAMP NOT NULL,      -- 创建时间
    update_time TIMESTAMP NOT NULL,      -- 更新时间
    FOREIGN KEY (topic_id) REFERENCES topics(topic_id)
);

CREATE INDEX idx_summary_queue_topic_id ON summary_queue(topic_id);
CREATE INDEX idx_summary_queue_priority ON summary_queue(priority);
CREATE INDEX idx_summary_queue_scheduled_time ON summary_queue(scheduled_time);
CREATE INDEX idx_summary_queue_status ON summary_queue(status);
```

## 3. 索引策略

### 3.1 向量索引策略

#### 3.1.1 消息向量索引

```sql
CREATE INDEX idx_messages_content_vector ON messages USING ivfflat (content_vector vector_l2_ops) WITH (lists = 100);
```

#### 3.1.2 主题向量索引

```sql
CREATE INDEX idx_topics_topic_vector ON topics USING ivfflat (topic_vector vector_l2_ops) WITH (lists = 100);
```

#### 3.1.3 摘要向量索引

```sql
CREATE INDEX idx_topic_summaries_summary_vector ON topic_summaries USING ivfflat (summary_vector vector_l2_ops) WITH (lists = 100);
```

#### 3.1.4 实体向量索引

```sql
CREATE INDEX idx_entities_entity_vector ON entities USING ivfflat (entity_vector vector_l2_ops) WITH (lists = 100);
```

#### 3.1.5 事实向量索引

```sql
CREATE INDEX idx_facts_fact_vector ON facts USING ivfflat (fact_vector vector_l2_ops) WITH (lists = 100);
```

#### 3.1.6 用户画像向量索引

```sql
CREATE INDEX idx_user_profiles_profile_vector ON user_profiles USING ivfflat (profile_vector vector_l2_ops) WITH (lists = 100);
```

### 3.2 结构化数据索引策略

#### 3.2.1 复合索引

```sql
CREATE INDEX idx_messages_chat_create_time ON messages(chat_id, create_time);
CREATE INDEX idx_topics_chat_is_active ON topics(chat_id, is_active);
CREATE INDEX idx_topic_messages_topic_relevance ON topic_messages(topic_id, relevance_score);
```

#### 3.2.2 JSONB索引

```sql
CREATE INDEX idx_topics_keywords_gin ON topics USING gin(keywords);
CREATE INDEX idx_entities_metadata_gin ON entities USING gin(metadata);
CREATE INDEX idx_relations_metadata_gin ON relations USING gin(metadata);
```

#### 3.2.3 部分索引

```sql
CREATE INDEX idx_topics_active ON topics(topic_id) WHERE is_active = TRUE;
CREATE INDEX idx_memory_strengths_pinned ON memory_strengths(memory_id, memory_type) WHERE is_pinned = TRUE;
```

#### 3.2.4 函数索引

```sql
CREATE INDEX idx_messages_content_lower ON messages(LOWER(content));
CREATE INDEX idx_topics_title_lower ON topics(LOWER(title));
```

## 4. 存储技术选型

### 4.1 PostgreSQL + Qdrant

选择PostgreSQL作为主要的关系型数据库，用于存储结构化数据，Qdrant作为向量数据库，用于存储和检索向量数据。

#### 4.1.1 PostgreSQL

PostgreSQL是一个功能强大的开源关系型数据库系统，具有以下优势：

- 强大的事务支持和ACID特性
- 丰富的数据类型和索引类型
- 良好的可扩展性和可靠性
- 活跃的社区和广泛的应用

#### 4.1.2 Qdrant

Qdrant是一个专注于向量相似度搜索的开源向量数据库，具有以下优势：

- 高效的向量相似度搜索，查询性能优于PostgreSQL + pgvector
- 支持多种距离度量方式（欧氏距离、余弦相似度等）
- 支持过滤和分面搜索
- 良好的水平扩展能力
- 简单的部署和维护
- 丰富的向量索引类型，包括HNSW、IVF等
- 完善的过滤和分片功能

### 4.2 Qdrant集合设计

为了支持三层记忆模型，我们在Qdrant中设计以下集合：

- **消息集合 (messages)**: 存储消息内容的向量表示，包含message_id、chat_id、user_id、user_name、content等字段
- **主题集合 (topics)**: 存储主题的向量表示，包含topic_id、title、description等字段
- **摘要集合 (summaries)**: 存储主题摘要的向量表示，包含summary_id、topic_id、content等字段
- **实体集合 (entities)**: 存储实体的向量表示，包含entity_id、entity_name、entity_type等字段
- **用户画像集合 (profiles)**: 存储用户画像的向量表示，包含user_id、profile_text等字段

### 4.3 Redis缓存

选择Redis作为缓存层，提高系统性能和响应速度。

#### 4.2.1 Redis的优势

- 高性能的内存数据库
- 丰富的数据结构（字符串、哈希、列表、集合、有序集合等）
- 支持原子操作
- 支持发布/订阅模式
- 支持集群模式

#### 4.2.2 Redis的应用场景

- 短期记忆缓存
- 热点数据缓存
- 会话信息缓存
- 计数器和限流器
- 分布式锁

### 4.4 数据分片、复制和备份策略

#### 4.4.1 数据分片策略

- 按会话ID分片：将同一会话的数据存储在同一分片中
- 按时间分片：按照时间范围对数据进行分片，便于历史数据的归档和清理
- 使用Citus扩展：对PostgreSQL进行水平扩展，支持大规模数据的存储和查询

#### 4.4.2 复制策略

- PostgreSQL主从复制：设置一个主节点和多个从节点，提高读取性能和系统可用性
- Redis主从复制：设置一个主节点和多个从节点，提高读取性能和系统可用性
- Qdrant复制：设置多个Qdrant节点，提高向量检索的性能和可用性

#### 4.4.3 备份策略

- 定期备份：每天进行一次全量备份，每小时进行一次增量备份
- 连续归档：使用PostgreSQL的WAL（预写式日志）进行连续归档，支持时间点恢复
- 多级备份：本地备份、远程备份和云存储备份，提高数据安全性

### 4.5 多级缓存架构

#### 4.5.1 缓存层次

- 应用级缓存：在应用服务器中使用内存缓存，如Caffeine或Guava Cache
- 分布式缓存：使用Redis作为分布式缓存，支持多个应用服务器共享缓存
- 数据库缓存：利用PostgreSQL的缓存机制，如共享缓冲区和查询计划缓存

#### 4.5.2 缓存策略

- 短期记忆缓存策略：缓存最近的消息和活跃主题，使用LRU（最近最少使用）策略进行缓存淘汰
- 主题和摘要缓存策略：缓存热门主题和摘要，使用LFU（最不经常使用）策略进行缓存淘汰
- 用户画像缓存策略：缓存活跃用户的画像信息，使用TTL（生存时间）策略进行缓存过期
- 缓存一致性策略：使用写直达（Write-Through）和写回（Write-Back）策略，确保缓存和数据库的一致性

## 5. 性能优化设计

### 5.1 查询优化策略

#### 5.1.1 SQL查询优化

- 使用EXPLAIN ANALYZE分析查询计划，找出性能瓶颈
- 优化JOIN操作，使用适当的JOIN类型和顺序
- 使用适当的过滤条件，减少数据扫描量
- 使用分页查询，避免一次性返回大量数据
- 优化向量查询，使用近似最近邻搜索算法

#### 5.1.2 查询缓存策略

- 结果缓存：缓存常用查询的结果，减少数据库访问
- 查询计划缓存：缓存常用查询的执行计划，减少查询解析和优化的开销

### 5.2 数据访问模式和批处理优化

#### 5.2.1 数据访问模式优化

- 预加载关联数据：使用JOIN或预加载技术，减少N+1查询问题
- 读写分离：将读操作和写操作分离，提高系统吞吐量
- 懒加载策略：只在需要时加载数据，减少不必要的数据加载

#### 5.2.2 批处理优化

- 批量插入：使用COPY命令或批量INSERT语句，提高数据插入性能
- 批量更新：使用批量UPDATE语句，提高数据更新性能
- 批量删除：使用批量DELETE语句，提高数据删除性能
- 异步批处理：使用异步处理技术，将批处理任务放入队列中异步执行

### 5.3 高并发场景下的性能保障

#### 5.3.1 连接池管理

- 连接池配置：根据系统负载和硬件资源，配置适当的连接池大小
- 连接监控管理：监控连接池的使用情况，及时调整连接池配置

#### 5.3.2 并发控制

- 乐观锁：使用版本号或时间戳实现乐观锁，减少锁竞争
- 悲观锁：在必要时使用SELECT FOR UPDATE语句实现悲观锁
- 行级锁优化：尽量使用行级锁，避免表级锁导致的并发问题

#### 5.3.3 请求限流和降级

- API限流：使用令牌桶或漏桶算法实现API限流，防止系统过载
- 服务降级：在系统负载过高时，降级非核心功能，保证核心功能的可用性

#### 5.3.4 分布式锁

- Redis分布式锁：使用Redis实现分布式锁，解决分布式系统中的并发控制问题
- 锁超时和自动释放：设置锁超时时间，防止死锁问题

### 5.4 监控和性能调优

#### 5.4.1 数据库监控

- 性能指标监控：监控CPU使用率、内存使用率、磁盘I/O、网络I/O等指标
- 监控系统实现：使用Prometheus、Grafana等工具实现监控系统

#### 5.4.2 查询性能分析

- 查询分析工具：使用pg_stat_statements扩展分析SQL查询性能
- 自动优化建议：根据查询性能分析结果，提供优化建议

#### 5.4.3 性能调优策略

- 自动VACUUM配置：根据数据变化率，配置适当的VACUUM参数
- 定期维护：定期执行ANALYZE、REINDEX等维护操作，保持数据库性能
- 参数调优：根据系统负载和硬件资源，调整PostgreSQL和Redis的配置参数

## 6. 实现示例

### 6.1 消息存储和检索示例

#### 6.1.1 消息存储

```python
async def store_message(message: ChatMessage):
    """存储消息"""
    # 生成消息向量
    content_vector = await generate_vector(message.content)
    
    # 存储消息
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO messages (
                message_id, chat_id, user_id, user_name, content, content_vector,
                role, is_mention_bot, root_message_id, reply_message_id, create_time
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            """,
            message.message_id, message.chat_id, message.user_id, message.user_name,
            message.content, content_vector, message.role, message.is_mention_bot,
            message.root_message_id, message.reply_message_id, message.create_time
        )
    
    # 缓存最近消息
    await cache_recent_message(message)
    
    # 异步分类消息主题
    background_tasks.add_task(classify_message_topic, message)
```

#### 6.1.2 消息检索

```python
async def search_messages(chat_id: str, query: str, limit: int = 10):
    """搜索消息"""
    # 生成查询向量
    query_vector = await generate_vector(query)
    
    # 搜索消息
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT message_id, chat_id, user_id, user_name, content, role,
                   is_mention_bot, root_message_id, reply_message_id, create_time,
                   content_vector <-> $1 AS distance
            FROM messages
            WHERE chat_id = $2
            ORDER BY distance
            LIMIT $3
            """,
            query_vector, chat_id, limit
        )
    
    return [dict(row) for row in rows]
```

### 6.2 主题分类和摘要生成示例

#### 6.2.1 主题分类

```python
async def classify_message_topic(message: ChatMessage):
    """分类消息主题"""
    # 检查是否是回复消息
    if message.reply_message_id:
        # 获取回复消息的主题
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT topic_id
                FROM topic_messages
                WHERE message_id = $1
                """,
                message.reply_message_id
            )
        
        if row and row['topic_id']:
            # 将消息关联到相同主题
            await associate_message_with_topic(message.message_id, row['topic_id'])
            return
    
    # 生成消息向量
    content_vector = await generate_vector(message.content)
    
    # 查找相似主题
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT topic_id, title, topic_vector,
                   topic_vector <-> $1 AS distance
            FROM topics
            WHERE chat_id = $2 AND is_active = TRUE
            ORDER BY distance
            LIMIT 5
            """,
            content_vector, message.chat_id
        )
    
    # 如果找到相似主题，关联消息到最相似的主题
    if rows and rows[0]['distance'] < 0.3:
        await associate_message_with_topic(message.message_id, rows[0]['topic_id'])
    else:
        # 创建新主题
        topic_id = str(uuid.uuid4())
        title = await generate_topic_title(message.content)
        
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO topics (
                    topic_id, title, creator_id, chat_id, topic_vector,
                    create_time, update_time
                ) VALUES ($1, $2, $3, $4, $5, $6, $6)
                """,
                topic_id, title, message.user_id, message.chat_id,
                content_vector, datetime.now()
            )
        
        # 关联消息到新主题
        await associate_message_with_topic(message.message_id, topic_id)
```

#### 6.2.2 摘要生成

```python
async def generate_topic_summary(topic_id: str):
    """生成主题摘要"""
    # 获取主题相关消息
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT m.message_id, m.user_id, m.user_name, m.content, m.role, m.create_time
            FROM messages m
            JOIN topic_messages tm ON m.message_id = tm.message_id
            WHERE tm.topic_id = $1
            ORDER BY m.create_time
            """,
            topic_id
        )
    
    if not rows:
        return
    
    # 构建对话历史
    conversation = []
    for row in rows:
        conversation.append({
            "role": row["role"],
            "content": row["content"],
            "user_id": row["user_id"],
            "user_name": row["user_name"],
            "create_time": row["create_time"].isoformat()
        })
    
    # 使用LLM生成摘要
    summary = await generate_summary_with_llm(conversation)
    
    # 生成摘要向量
    summary_vector = await generate_vector(summary)
    
    # 存储摘要
    summary_id = str(uuid.uuid4())
    now = datetime.now()
    
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO topic_summaries (
                summary_id, topic_id, content, summary_vector,
                create_time, update_time, version
            ) VALUES ($1, $2, $3, $4, $5, $5, 1)
            """,
            summary_id, topic_id, summary, summary_vector, now
        )
```

### 6.3 用户画像构建和更新示例

#### 6.3.1 用户画像构建

```python
async def build_user_profile(user_id: str, user_name: str):
    """构建用户画像"""
    # 获取用户相关消息
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT content, create_time
            FROM messages
            WHERE user_id = $1 AND role = 'user'
            ORDER BY create_time DESC
            LIMIT 100
            """,
            user_id
        )
    
    if not rows:
        return
    
    # 构建用户消息历史
    messages = [row["content"] for row in rows]
    
    # 使用LLM提取用户画像
    profile_text = await extract_user_profile_with_llm(messages, user_name)
    
    # 生成画像向量
    profile_vector = await generate_vector(profile_text)
    
    # 存储用户画像
    now = datetime.now()
    
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO user_profiles (
                user_id, profile_text, profile_vector, create_time, update_time
            ) VALUES ($1, $2, $3, $4, $4)
            ON CONFLICT (user_id) DO UPDATE SET
                profile_text = $2,
                profile_vector = $3,
                update_time = $4
            """,
            user_id, profile_text, profile_vector, now
        )
```

#### 6.3.2 用户偏好提取

```python
async def extract_user_preferences(user_id: str, user_name: str):
    """提取用户偏好"""
    # 获取用户相关消息
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT content, create_time
            FROM messages
            WHERE user_id = $1 AND role = 'user'
            ORDER BY create_time DESC
            LIMIT 100
            """,
            user_id
        )
    
    if not rows:
        return
    
    # 构建用户消息历史
    messages = [row["content"] for row in rows]
    
    # 使用LLM提取用户偏好
    preferences = await extract_user_preferences_with_llm(messages, user_name)
    
    # 存储用户偏好
    now = datetime.now()
    
    async with pool.acquire() as conn:
        async with conn.transaction():
            # 删除旧的偏好
            await conn.execute(
                """
                DELETE FROM user_preferences
                WHERE user_id = $1
                """,
                user_id
            )
            
            # 插入新的偏好
            for pref in preferences:
                await conn.execute(
                    """
                    INSERT INTO user_preferences (
                        user_id, preference_key, preference_value, confidence,
                        create_time, update_time
                    ) VALUES ($1, $2, $3, $4, $5, $5)
                    """,
                    user_id, pref["key"], pref["value"], pref["confidence"], now
                )
```

### 6.4 记忆强度计算和遗忘处理示例

#### 6.4.1 记忆强度计算

```python
async def calculate_memory_strength(memory_id: str, memory_type: str):
    """计算记忆强度"""
    now = datetime.now()
    
    # 获取记忆信息
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT create_time, last_access_time, strength
            FROM memory_strengths
            WHERE memory_id = $1 AND memory_type = $2
            """,
            memory_id, memory_type
        )
    
    if not row:
        # 新记忆，初始强度为1.0
        strength = 1.0
        create_time = now
        last_access_time = now
    else:
        # 计算时间衰减
        days_since_creation = (now - row["create_time"]).days
        days_since_last_access = (now - row["last_access_time"]).days
        
        # 基于艾宾浩斯遗忘曲线计算强度衰减
        decay = math.exp(-0.1 * days_since_last_access)
        
        # 考虑记忆年龄的影响
        age_factor = 1.0 / (1.0 + 0.05 * days_since_creation)
        
        # 更新记忆强度
        strength = row["strength"] * decay * age_factor
        create_time = row["create_time"]
        last_access_time = now
    
    # 存储记忆强度
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO memory_strengths (
                memory_id, memory_type, strength, last_access_time,
                create_time, update_time
            ) VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (memory_id, memory_type) DO UPDATE SET
                strength = $3,
                last_access_time = $4,
                update_time = $6
            """,
            memory_id, memory_type, strength, last_access_time,
            create_time, now
        )
    
    return strength
```

#### 6.4.2 记忆遗忘处理

```python
async def process_forgetting_queue():
    """处理记忆遗忘队列"""
    now = datetime.now()
    
    # 获取待处理的遗忘任务
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT queue_id, memory_id, memory_type
            FROM forgetting_queue
            WHERE status = 'pending' AND scheduled_time <= $1
            ORDER BY priority DESC, scheduled_time
            LIMIT 100
            """,
            now
        )
    
    for row in rows:
        queue_id = row["queue_id"]
        memory_id = row["memory_id"]
        memory_type = row["memory_type"]
        
        # 更新任务状态为处理中
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE forgetting_queue
                SET status = 'processing', update_time = $1
                WHERE queue_id = $2
                """,
                now, queue_id
            )
        
        try:
            # 获取记忆强度
            async with pool.acquire() as conn:
                strength_row = await conn.fetchrow(
                    """
                    SELECT strength, is_pinned
                    FROM memory_strengths
                    WHERE memory_id = $1 AND memory_type = $2
                    """,
                    memory_id, memory_type
                )
            
            if not strength_row:
                # 记忆不存在，标记任务为完成
                async with pool.acquire() as conn:
                    await conn.execute(
                        """
                        UPDATE forgetting_queue
                        SET status = 'completed', update_time = $1
                        WHERE queue_id = $2
                        """,
                        now, queue_id
                    )
                continue
            
            # 如果记忆被固定，跳过遗忘
            if strength_row["is_pinned"]:
                async with pool.acquire() as conn:
                    await conn.execute(
                        """
                        UPDATE forgetting_queue
                        SET status = 'completed', update_time = $1
                        WHERE queue_id = $2
                        """,
                        now, queue_id
                    )
                continue
            
            # 根据记忆强度决定遗忘操作
            strength = strength_row["strength"]
            
            if strength < 0.1:
                # 强度很低，执行硬遗忘（删除记忆）
                await forget_memory_hard(memory_id, memory_type)
            elif strength < 0.3:
                # 强度较低，执行软遗忘（归档记忆）
                await forget_memory_soft(memory_id, memory_type)
            
            # 更新任务状态为完成
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    UPDATE forgetting_queue
                    SET status = 'completed', update_time = $1
                    WHERE queue_id = $2
                    """,
                    now, queue_id
                )
        
        except Exception as e:
            # 更新任务状态为失败
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    UPDATE forgetting_queue
                    SET status = 'failed', update_time = $1
                    WHERE queue_id = $2
                    """,
                    now, queue_id
                )
            
            logger.error(f"Failed to process forgetting task {queue_id}: {str(e)}")
```

## 7. 总结

本文档详细描述了飞书闲聊记忆框架的存储方案设计，包括数据模型、索引策略、存储技术选型和性能优化设计。该方案基于三层记忆模型（短期记忆、中期记忆和长期记忆）和AI驱动算法的需求，设计了高效、可扩展、安全的存储解决方案。

主要特点包括：

1. **多层次记忆数据模型**：设计了短期记忆、中期记忆和长期记忆的数据模型，支持不同时效性和粒度的记忆存储和检索。
2. **高效索引策略**：设计了向量索引和结构化数据索引策略，支持高效的向量相似度搜索和结构化数据查询。
3. **优化的存储技术选型**：选择PostgreSQL作为关系型数据库，Qdrant作为向量数据库（替代pgvector），Redis作为缓存层，结合它们的优势，提供高性能、可扩展的存储解决方案。用户信息（ID和名称）仅作为消息属性直接存储，不做映射。
4. **全面的性能优化设计**：包括查询优化、数据访问模式优化、批处理优化和高并发场景下的性能保障措施。
5. **实用的实现示例**：提供了消息存储和检索、主题分类和摘要生成、用户画像构建和更新、记忆强度计算和遗忘处理等实现示例，便于实际开发和部署。

该存储方案为飞书闲聊记忆框架提供了坚实的存储基础，能够支持高效的记忆存储、检索和管理，满足用户对个性化、连贯和智能对话体验的需求。
