# L3群组记忆使用指南

## 📋 快速开始

本指南帮助你快速上手L3群组记忆功能，包括手动触发演进、查询记忆等操作。

---

## 🚀 前置准备

### 1. 安装依赖

```bash
cd ai-service
uv sync  # 或 pip install -r requirements.txt
```

新增的依赖：
- `json-repair>=0.25.0` - JSON容错解析

### 2. 配置Langfuse Prompt

按照 [`langfuse_prompt_memory_evolve.md`](./langfuse_prompt_memory_evolve.md) 配置 `memory_evolve` prompt。

### 3. 创建Qdrant Collection

服务启动时会自动创建 `group_memories` collection。

---

## 🎯 核心功能

### 1. 手动触发记忆演进

**接口**: `POST /memory/evolve/{group_id}`

**示例请求**:
```bash
curl -X POST "http://localhost:8000/memory/evolve/group_test_001?days=1" \
  -H "Content-Type: application/json"
```

**参数说明**:
- `group_id`: 群组ID（路径参数）
- `days`: 获取最近N天的消息，默认1天（查询参数，可选）

**响应示例**:
```json
{
  "success": true,
  "group_id": "group_test_001",
  "evolution_time": "2025-01-21T10:30:00Z",
  "stats": {
    "kept": 3,
    "updated": 2,
    "created": 1,
    "deleted": 0
  },
  "changes": [
    {
      "action": "update",
      "old_id": "uuid-2",
      "new_statement": "群组偏好看科幻和治愈系动漫",
      "change_reason": "新讨论中明确了具体类型偏好"
    },
    {
      "action": "create",
      "statement": "成员普遍从事前端开发工作",
      "change_reason": "多次讨论中验证的稳定特征"
    }
  ],
  "message": null
}
```

---

### 2. 查询群组记忆列表

**接口**: `GET /memory/list/{group_id}`

**示例请求**:
```bash
curl "http://localhost:8000/memory/list/group_test_001?status=active&limit=20"
```

**参数说明**:
- `group_id`: 群组ID（路径参数）
- `status`: 状态过滤 - `active` | `deprecated` | `all`，默认`active`（查询参数）
- `limit`: 返回数量限制，默认20（查询参数）

**响应示例**:
```json
{
  "success": true,
  "group_id": "group_test_001",
  "total": 5,
  "memories": [
    {
      "memory_id": "uuid-1",
      "group_id": "group_test_001",
      "statement": "群组成员主要是技术背景",
      "version": 3,
      "created_at": "2025-01-01T00:00:00Z",
      "updated_at": "2025-01-10T12:00:00Z",
      "parent_id": "uuid-0",
      "change_summary": "根据新讨论更新",
      "status": "active",
      "strength": 0.9
    }
  ]
}
```

---

### 3. 语义搜索记忆

**接口**: `GET /memory/search/{group_id}`

**示例请求**:
```bash
curl "http://localhost:8000/memory/search/group_test_001?q=技术背景&limit=5&threshold=0.7"
```

**参数说明**:
- `group_id`: 群组ID（路径参数）
- `q`: 搜索查询文本（查询参数，必需）
- `limit`: 返回数量限制，默认5（查询参数）
- `threshold`: 相似度阈值(0-1)，默认0.7（查询参数）

**响应示例**:
```json
{
  "success": true,
  "query": "技术背景",
  "results": [
    {
      "memory_id": "uuid-1",
      "statement": "群组成员主要是前端开发背景",
      "score": 0.92,
      "version": 3,
      "updated_at": "2025-01-10T12:00:00Z"
    }
  ]
}
```

---

### 4. 查询记忆统计

**接口**: `GET /memory/stats/{group_id}`

**示例请求**:
```bash
curl "http://localhost:8000/memory/stats/group_test_001"
```

**响应示例**:
```json
{
  "success": true,
  "group_id": "group_test_001",
  "total_memories": 8,
  "active_memories": 6,
  "deprecated_memories": 2,
  "avg_version": 2.3
}
```

---

## 🧪 测试场景

### 测试1: 首次演进（空记忆）

**目标**: 验证从零开始提取记忆

**前置条件**:
- 群组无现有记忆
- 有至少20条讨论消息

**步骤**:
```bash
# 1. 确认群组无记忆
curl "http://localhost:8000/memory/list/group_new_001"

# 2. 触发演进
curl -X POST "http://localhost:8000/memory/evolve/group_new_001?days=1"

# 3. 查看结果
curl "http://localhost:8000/memory/list/group_new_001"
```

**期望结果**:
- `created` >= 3
- 所有记忆 `version=1`, `parent_id=null`
- `statement` 简洁明确

---

### 测试2: 正常演进（更新+新增）

**目标**: 验证记忆更新和新增逻辑

**前置条件**:
- 群组已有5条记忆
- 新消息强化了2条记忆，引入了1个新话题

**步骤**:
```bash
# 1. 查看初始记忆
curl "http://localhost:8000/memory/list/group_test_001"

# 2. 触发演进
curl -X POST "http://localhost:8000/memory/evolve/group_test_001?days=1"

# 3. 对比变化
curl "http://localhost:8000/memory/list/group_test_001"
```

**期望结果**:
- `kept` = 3
- `updated` = 2 (version++, parent_id指向旧版)
- `created` = 1 (version=1)
- `deleted` = 0

---

### 测试3: 记忆过时（删除）

**目标**: 验证过时记忆删除逻辑

**前置条件**:
- 群组有记忆："每周五讨论新番"
- 最近3周无相关讨论

**步骤**:
```bash
# 触发演进
curl -X POST "http://localhost:8000/memory/evolve/group_test_001?days=7"

# 查看deprecated记忆
curl "http://localhost:8000/memory/list/group_test_001?status=deprecated"
```

**期望结果**:
- `deleted` >= 1
- 过时记忆 `status=deprecated`

---

### 测试4: 语义搜索

**目标**: 验证向量搜索功能

**步骤**:
```bash
# 搜索技术相关记忆
curl "http://localhost:8000/memory/search/group_test_001?q=群组的技术背景"
```

**期望结果**:
- 返回相关记忆
- `score` > 0.7
- 结果按相似度排序

---

## 🔧 集成到应用

### 在聊天中使用记忆

在聊天服务中查询相关记忆并注入到prompt：

```python
from app.memory.l3_memory_service import search_relevant_memories

async def build_chat_context(group_id: str, user_query: str):
    # 搜索相关记忆
    memories = await search_relevant_memories(
        group_id=group_id,
        query=user_query,
        k=3,
        threshold=0.75
    )
    
    # 构建上下文
    memory_context = "\n".join([
        f"- {m['statement']}"
        for m in memories
    ])
    
    system_prompt = f"""
    ## 群组记忆
    以下是该群组的长期记忆，帮助你更好地理解群组文化：
    {memory_context}
    
    请根据这些记忆调整你的回复风格和内容。
    """
    
    return system_prompt
```

---

## 📊 监控与维护

### 1. 检查演进质量

定期查看演进结果，评估质量：
```bash
# 查看最近变更
curl "http://localhost:8000/memory/list/group_test_001?limit=10"
```

**质量指标**:
- 记忆数量: 10-30条/群组为宜
- 平均版本: >2 表示持续演进
- 记忆表述: 简洁、准确、客观

### 2. 调优Langfuse Prompt

根据输出质量，在Langfuse后台调整prompt：
- 如果记忆过细：强化"稳定性"要求
- 如果更新不足：增加update示例
- 如果格式错误：使用json-repair容错

### 3. 定时任务（可选）

启用定时任务自动演进：

编辑 [`workers/unified_worker.py`](../ai-service/app/workers/unified_worker.py):
```python
cron_jobs = [
    # 每天凌晨2点执行记忆演进
    cron(cron_daily_memory_evolve, hour=2, minute=0),
]
```

---

## 🚨 故障排查

### 问题1: 演进失败

**症状**: 接口返回500错误

**排查步骤**:
1. 查看日志: `docker-compose logs ai-service`
2. 确认Langfuse prompt存在
3. 确认Qdrant连接正常
4. 确认群组有消息数据

---

### 问题2: JSON解析错误

**症状**: 日志中出现"JSON解析失败"

**解决方案**:
1. 确认已安装`json-repair`
2. 查看LLM原始输出
3. 优化Langfuse prompt的输出格式说明

---

### 问题3: 记忆质量不佳

**症状**: 提取的记忆过于细碎或不准确

**解决方案**:
1. 调整prompt中的"稳定性"要求
2. 增加更多示例
3. 调整`days`参数，获取更长时间的消息

---

## 📚 相关文档

- [技术设计方案](./l3_group_memory_design.md)
- [Langfuse Prompt配置](./langfuse_prompt_memory_evolve.md)
- [API接口代码](../ai-service/app/api/memory.py)
- [核心服务代码](../ai-service/app/memory/l3_memory_service.py)

---

## 💡 最佳实践

### 1. 演进频率

- **手动触发**: 适合测试和调试
- **定时触发**: 生产环境建议每天1次（凌晨低峰期）
- **按需触发**: 群组特殊事件后手动触发

### 2. 消息时间窗口

- **初次演进**: `days=7` (获取更完整的历史)
- **日常演进**: `days=1` (增量更新)
- **大型重构**: `days=30` (全面重新评估)

### 3. 记忆管理

- 定期审查过时记忆（`status=deprecated`）
- 控制记忆数量（建议10-30条）
- 监控记忆演进频率（avg_version）

---

## ✅ 检查清单

实施前确认：

- [ ] Langfuse `memory_evolve` prompt已配置
- [ ] `json-repair` 依赖已安装
- [ ] Qdrant `group_memories` collection已创建
- [ ] API路由已注册
- [ ] Worker任务已更新

测试通过：

- [ ] 空记忆场景：首次演进成功
- [ ] 正常演进：更新+新增正常
- [ ] 过时删除：deprecated状态正确
- [ ] 语义搜索：返回相关结果

---

## 🔄 版本历史

| 版本 | 日期 | 变更说明 |
|------|------|----------|
| v1.0 | 2025-01-21 | 初始版本 |