# 系统改进总结

本文档记录了对 main server 和 ai service 交互协议以及飞书卡片渲染系统的改进。

## 问题分析

### 1. 理解问题
- **交互协议分析**: main server 通过 SSE (Server-Sent Events) 与 ai service 通信
- **卡片渲染流程**: 流式事件通过状态机处理，最终渲染成飞书卡片
- **现有问题识别**: 
  - Moonshot 模型名称错误
  - 内容过滤处理逻辑缺陷
  - 缺乏重试机制和失败回退
  - 底部栏状态显示单一

### 2. 思考问题
- **模型切换机制**: 内容过滤错误应该让上层捕获以便切换模型
- **用户体验**: 失败时应该显示错误卡片，而不是让用户以为卡住了
- **状态反馈**: 工具调用时需要提供更丰富的状态信息

## 解决方案

### 1. 修复 Moonshot 模型配置 ✅

**文件**: `ai-service/app/services/chat_service.py`

```python
# 修正模型名称
{"id": "Moonshot/kimi-k2-0711-preview", "name": "备用模型"}
```

**文件**: `ai-service/app/services/chat/message.py`

```python
# 修复内容过滤处理逻辑
except ContentFilterError:
    # 内容过滤错误需要重新抛出，让上层处理模型切换
    raise
except Exception as e:
    # 如果出现其他错误，输出错误信息
    logger.error(f"生成回复时出现错误: {str(e)}\n{traceback.format_exc()}")
    yield ChatStreamChunk(content=f"生成回复时出现错误: {str(e)}")
```

### 2. 增强 SSE 重试机制 ✅

**文件**: `main-server/src/utils/sse/client.ts`

```typescript
// 修复重试逻辑
} catch (err) {
    this.isConnected = false;

    if (this.options.autoReconnect && this.retryCount < this.options.retries) {
        this.retryCount++;
        setTimeout(() => {
            if (!this.abortController?.signal.aborted) connect();
        }, this.options.retryDelay);
    } else {
        // 所有重试都失败了，调用错误回调
        if (onError) onError(err);
    }
}
```

**文件**: `main-server/src/services/ai/chat.ts`

```typescript
// 增加重试次数和延迟
const client = new SSEClient<ChatResponse>(`${BASE_URL}/chat/sse`, {
    // ...
    retries: 5, // 增加重试次数以处理504等网络错误
    retryDelay: 2000, // 增加重试延迟
    autoReconnect: true,
});

// 确保失败时触发失败回调
const onError = async (error: unknown) => {
    console.error('SSE 连接错误:', error);
    // 确保在失败时也会触发失败回调
    await stateMachine.handleResponse({ step: Step.FAILED });
    await stateMachine.forceEnd(error instanceof Error ? error : new Error(String(error)));
};
```

### 3. 完善失败回退卡片 ✅

**文件**: `main-server/src/services/lark/basic/card-lifecycle-manager.ts`

```typescript
// 确保失败时创建错误卡片
private async handleErrorOnly(): Promise<void> {
    if (!this.cardId) {
        // 如果还没有创建卡片，先创建一个
        await this.registerReply();
    }
    await this.removeLoadingElements();
    await this.handleError();
    await this.addInteractionElements();
}
```

### 4. 优化底部栏状态显示 ✅

#### 扩展通信协议

**文件**: `ai-service/app/types/chat.py`

```python
class ToolCallFeedbackResponse(BaseModel):
    name: str  # 工具调用名称
    nick_name: str | None = None  # 工具调用昵称
    status_message: str | None = None  # 状态消息，用于更新底部栏显示

class ChatStatusResponse(BaseModel):
    step: Step = Step.SEND  # 步骤
    status_message: str  # 状态消息

ChatResponse = ChatProcessResponse | ChatNormalResponse | ChatStatusResponse
```

**文件**: `main-server/src/types/chat.ts`

```typescript
export interface ToolCallFeedbackResponse {
    name: string;
    nick_name?: string;
    status_message?: string; // 状态消息，用于更新底部栏显示
}

interface ChatStatusResponse {
    step: Step.SEND;
    status_message: string;
}

export type ChatResponse = ChatProcessResponse | ChatNormalResponse | ChatStatusResponse;
```

#### 创建工具状态服务

**文件**: `ai-service/app/services/chat/tool_status.py`

```python
class ToolStatusService:
    # 工具状态消息映射，基于实际注册的工具，考虑到赤尾是人类美少女的设定
    TOOL_STATUS_MESSAGES: Dict[str, str] = {
        # 搜索相关工具
        "search_web": "赤尾正在努力上网搜索~",
        "search_donjin_event": "赤尾正在查找同人活动信息...",
        
        # 话题总结工具
        "topic_summary": "赤尾正在整理话题总结呢...",
        
        # Bangumi相关工具
        "bangumi_search": "赤尾正在查询ACG信息~",
        "search_characters": "赤尾正在搜索角色信息...",
        "search_persons": "赤尾正在查找人物资料...",
        # ... 更多Bangumi工具
    }
    
    # 默认状态消息
    DEFAULT_STATUS_MESSAGES = {
        "thinking": "赤尾思考中...",
        "replying": "赤尾回复中...",
        "tool_calling": "赤尾正在调用工具...",
    }
```

#### 更新卡片渲染逻辑

**文件**: `main-server/src/types/ai.ts`

```typescript
// 扩展流式响应动作类型
export type StreamAction = 
    | { type: 'text'; content: string } 
    | { type: 'think'; content: string }
    | { type: 'status'; content: string };
```

**文件**: `main-server/src/services/lark/basic/card-lifecycle-manager.ts`

```typescript
// 添加状态更新方法
public async updateStatus(statusMessage: string): Promise<void> {
    if (this.cardId) {
        await this.apiClient.streamUpdateText(this.cardId, ELEMENT_IDS.THINKING_PLACEHOLDER, statusMessage, this.getSequence());
    }
}

// 更新动作处理器
case 'status':
    if (action.content.length > 0) {
        await this.updateStatus(action.content);
    }
    break;
```

#### 智能状态消息生成

**文件**: `ai-service/app/services/chat/message.py`

```python
# 检查是否有工具调用
if chunk.delta and chunk.delta.tool_calls:
    first_tool_call = chunk.delta.tool_calls[0]
    if hasattr(first_tool_call, 'function') and hasattr(first_tool_call.function, 'name') and first_tool_call.function.name:
        tool_name = first_tool_call.function.name
        status_message = ToolStatusService.get_tool_status_message(tool_name)
        yield ChatStreamChunk(
            tool_call_feedback=ToolCallFeedbackResponse(
                name=tool_name,
                status_message=status_message
            )
        )

# 处理文本内容开始
if chunk.delta and chunk.delta.content:
    if first_content_chunk:
        first_content_chunk = False
        yield ChatStreamChunk(
            tool_call_feedback=ToolCallFeedbackResponse(
                name="text_generation",
                status_message=ToolStatusService.get_default_status_message("replying")
            )
        )
```

## 技术架构改进

### 1. 通信协议优化
- 扩展了 `ChatResponse` 类型，支持状态消息
- 增加了 `ToolCallFeedbackResponse` 的状态消息字段
- 新增 `ChatStatusResponse` 专门用于状态更新

### 2. 状态管理增强
- 创建了 `ToolStatusService` 管理不同工具的状态文案
- 实现了智能状态检测，根据工具调用和内容生成自动切换状态
- 支持自定义状态消息，提升用户体验

### 3. 错误处理完善
- 修复了内容过滤错误的传递机制
- 增强了 SSE 连接的重试逻辑
- 确保失败时始终显示错误卡片

### 4. 用户体验优化
- 底部栏状态从单一的"思考中"变为动态的状态显示
- 工具调用时显示具体的工具相关状态
- 状态文案符合赤尾人类美少女的设定

## 部署注意事项

1. **依赖更新**: 确保 AI service 和 main server 同时部署，避免类型不匹配
2. **配置检查**: 验证 Moonshot 模型配置是否正确
3. **监控**: 关注 SSE 连接的重试情况和失败率
4. **测试**: 重点测试工具调用场景的状态显示效果

## 效果预期

1. **稳定性提升**: 通过重试机制和错误处理，减少因网络问题导致的失败
2. **用户体验改善**: 清晰的状态反馈让用户了解系统当前的处理进度
3. **模型切换优化**: 内容过滤时能正确切换到备用模型
4. **个性化体验**: 状态文案符合角色设定，提升用户互动体验