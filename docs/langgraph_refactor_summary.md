# LangGraph 重构方案概览

## 🎯 重构目标

将 ai-service 的 `/chat/sse` 接口从传统的线性处理模式重构为基于 LangGraph 的图工作流架构，实现：

- ✅ **完全兼容** - 保持现有接口和输出格式不变
- ✅ **动态模型** - 支持运行时模型切换和配置
- ✅ **流式输出** - 保持 0.5s 缓存和累积内容机制
- ✅ **工具调用** - 集成现有工具系统
- ✅ **可扩展性** - 为未来复杂工作流奠定基础

## 📊 架构对比

### 当前架构
```
消息接收 → 上下文构建 → AI生成 → 工具调用 → 流式返回
```

### 重构后架构
```
初始化 → 提示词生成 → 模型调用 → 工具执行 → 输出处理 → 清理
  ↓         ↓           ↓        ↓        ↓         ↓
状态管理   动态注入    流式处理   并行支持   特殊处理   资源释放
```

## 🏗️ 核心模块

### 1. 状态管理 (`state.py`)
```python
class ChatGraphState(TypedDict):
    message_id: str
    context: MessageContext
    model_config: Dict[str, Any]
    accumulated_content: str
    current_chunks: List[ChatStreamChunk]
    # ... 其他状态字段
```

### 2. 图节点 (`nodes.py`)
- **initialize_node** - 初始化上下文和加锁
- **prompt_generation_node** - 动态提示词生成
- **model_call_node** - 模型调用和流式处理
- **tool_execution_node** - 工具调用和结果处理
- **output_processing_node** - 特殊输出处理
- **cleanup_node** - 资源清理和解锁

### 3. 流式处理 (`streaming.py`)
- 维护 0.5s 缓存机制
- 累积内容而非差量内容
- 兼容现有 ChatStreamChunk 格式

### 4. 模型服务 (`models.py`)
- 复用现有 OpenAI 客户端缓存
- 支持动态模型切换
- 处理工具调用和流式响应

## 📋 实施计划

| 阶段 | 时间 | 任务 | 交付物 |
|------|------|------|--------|
| 阶段1 | 3-4天 | 核心架构搭建 | 图定义、节点实现、状态管理 |
| 阶段2 | 1-2天 | 提示词重构 | LangChain 模板、提示词迁移 |
| 阶段3 | 2-3天 | 服务层重构 | 新ChatService、接口适配 |
| 阶段4 | 2-3天 | 测试验证 | 单元测试、集成测试、性能测试 |
| 阶段5 | 2-3天 | 灰度发布 | 双栈运行、监控、反馈收集 |
| 阶段6 | 1-2天 | 全量切换 | 代码清理、文档更新 |

## 🔄 迁移策略

### 双栈运行期
```python
# 配置控制
enable_langgraph: bool = False
langgraph_fallback: bool = True

# 灰度控制
def should_use_langgraph(message_id: str) -> bool:
    return hash(message_id) % 100 < 10  # 10% 流量
```

### 兼容性保证
- 保持 `/chat/sse` 接口不变
- 保持流式输出格式不变
- 保持特殊处理逻辑不变（content_filter、length 等）
- 保持工具调用机制不变

## 📈 预期收益

### 短期收益
- 代码结构更清晰
- 错误处理更完善
- 调试体验更好
- 状态管理更规范

### 长期收益
- 支持复杂多步推理
- 支持并行工具调用
- 支持条件分支逻辑
- 支持工作流可视化

## ⚠️ 关键风险

### 技术风险
- **性能开销** - LangGraph 可能带来额外开销
- **兼容性** - 输出格式的微小差异
- **依赖稳定性** - 新依赖库的稳定性

### 应对措施
- 详细性能测试和基准对比
- 全面回归测试和用户验收测试
- 锁定依赖版本和准备降级方案

## 📊 监控指标

### 关键指标
- 响应时间（P50/P95/P99）
- 错误率和成功率
- 资源使用率（CPU/内存）
- 工具调用成功率

### 告警阈值
- 响应时间 > 5秒
- 错误率 > 5%
- CPU 使用率 > 80%
- 内存使用率 > 80%

## 🚀 快速开始

### 1. 依赖安装
```bash
cd main-server
uv add langgraph>=0.0.40 langchain>=0.1.0 langchain-openai>=0.1.0
```

### 2. 目录创建
```bash
mkdir -p ai-service/app/services/chat/langgraph
mkdir -p ai-service/app/services/chat/prompts
mkdir -p ai-service/app/services/chat/legacy
```

### 3. 运行测试
```bash
cd ai-service
python -m pytest tests/test_langgraph_chat.py -v
```

### 4. 启用LangGraph
```python
# 在 app/config/config.py 中
enable_langgraph: bool = True
```

## 📚 参考资料

- [LangGraph 官方文档](https://langchain-ai.github.io/langgraph/)
- [LangChain 提示词模板](https://python.langchain.com/docs/modules/model_io/prompts/)
- [详细实施方案](./langgraph_refactor_plan.md)

---

**注意：** 本方案处于规划阶段，实施前请充分评估风险并进行技术预研。
