# API 参考

本文档记录 Inner Bot Server 的主要 API 端点。

## Main Server API

**基础 URL**: `http://localhost:3001`

### 健康检查

#### GET /api/health

检查服务健康状态。

**响应示例**:

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00Z",
  "services": {
    "database": "connected",
    "redis": "connected",
    "ai-service": "available"
  }
}
```

### 飞书事件回调

#### POST /api/lark/event

接收飞书事件回调。

**请求头**:

```
Content-Type: application/json
X-Lark-Request-Timestamp: 1234567890
X-Lark-Request-Nonce: nonce
X-Lark-Signature: signature
```

**请求体** (消息事件示例):

```json
{
  "schema": "2.0",
  "header": {
    "event_id": "event_id",
    "event_type": "im.message.receive_v1",
    "create_time": "1234567890",
    "token": "verification_token",
    "app_id": "app_id"
  },
  "event": {
    "sender": {
      "sender_id": {
        "open_id": "ou_xxx",
        "user_id": "user_id"
      },
      "sender_type": "user"
    },
    "message": {
      "message_id": "om_xxx",
      "chat_id": "oc_xxx",
      "chat_type": "group",
      "content": "{\"text\":\"@_user_1 你好\"}",
      "message_type": "text"
    }
  }
}
```

**响应**:

```json
{
  "code": 0,
  "msg": "success"
}
```

#### POST /api/lark/card

接收飞书卡片交互回调。

**请求体**:

```json
{
  "open_id": "ou_xxx",
  "user_id": "user_id",
  "open_message_id": "om_xxx",
  "open_chat_id": "oc_xxx",
  "action": {
    "value": {
      "action": "retry",
      "message_id": "msg_xxx"
    },
    "tag": "button"
  }
}
```

### 图片处理

#### POST /api/image/process

处理图片（添加文字、滤镜等）。

**请求头**:

```
Content-Type: application/json
Authorization: Bearer <token>
```

**请求体**:

```json
{
  "image_url": "https://example.com/image.jpg",
  "operations": [
    {
      "type": "text",
      "content": "Hello World",
      "position": "bottom",
      "font_size": 24,
      "color": "#FFFFFF"
    }
  ]
}
```

**响应**:

```json
{
  "success": true,
  "image_url": "https://storage.example.com/processed/xxx.jpg"
}
```

---

## AI Service API

**基础 URL**: `http://localhost:8000`

### 健康检查

#### GET /health

检查 AI 服务健康状态。

**响应示例**:

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00Z",
  "service": "ai-service"
}
```

### ���天接口

#### POST /chat/sse

流式聊天接口，使用 Server-Sent Events (SSE) 返回响应。

**请求头**:

```
Content-Type: application/json
Authorization: Bearer <token>
X-Trace-Id: trace-id
X-App-Name: main-server
```

**请求体**:

```json
{
  "message": "你好，请介绍一下自己",
  "conversation_id": "conv_xxx",
  "user_id": "user_xxx",
  "chat_id": "chat_xxx",
  "context": {
    "history": [
      {
        "role": "user",
        "content": "之前的消息"
      },
      {
        "role": "assistant",
        "content": "之前的回复"
      }
    ]
  },
  "options": {
    "enable_tools": true,
    "enable_memory": true,
    "model": "gpt-4"
  }
}
```

**SSE 响应事件**:

```
event: status
data: {"status": "thinking"}

event: think
data: {"content": "正在思考..."}

event: text
data: {"content": "你好！我是"}

event: text
data: {"content": "赤尾，一个"}

event: text
data: {"content": "AI助手。"}

event: tool_call
data: {"tool": "web_search", "args": {"query": "天气"}}

event: tool_result
data: {"tool": "web_search", "result": "今天天气晴朗..."}

event: done
data: {"message_id": "msg_xxx", "total_tokens": 150}
```

**SSE 事件类型**:

| 事件 | 说明 |
|------|------|
| `status` | 状态变更（thinking, generating, done） |
| `think` | 思考过程（可选显示） |
| `text` | 文本内容片段 |
| `tool_call` | 工具调用开始 |
| `tool_result` | 工具调用结果 |
| `error` | 错误信息 |
| `done` | 完成标记 |

### 文本提取

#### POST /extract_batch

批量提取文本中的实体。

**请求体**:

```json
{
  "texts": [
    "今天北京天气很好",
    "明天上海会下雨"
  ],
  "entity_types": ["location", "date", "weather"],
  "model": "gpt-3.5-turbo"
}
```

**响应**:

```json
{
  "results": [
    {
      "text": "今天北京天气很好",
      "entities": [
        {"type": "date", "value": "今天"},
        {"type": "location", "value": "北京"},
        {"type": "weather", "value": "很好"}
      ]
    },
    {
      "text": "明天上海会下雨",
      "entities": [
        {"type": "date", "value": "明天"},
        {"type": "location", "value": "上海"},
        {"type": "weather", "value": "下雨"}
      ]
    }
  ]
}
```

---

## 内部 API

以下 API 用于服务间通信，需要 `INNER_HTTP_SECRET` 认证。

### 记忆服务

#### POST /memory/search

搜索相关记忆。

**请求体**:

```json
{
  "query": "用户之前说过什么",
  "user_id": "user_xxx",
  "limit": 5
}
```

**响应**:

```json
{
  "memories": [
    {
      "id": "mem_xxx",
      "content": "用户说他喜欢编程",
      "score": 0.95,
      "created_at": "2024-01-01T10:00:00Z"
    }
  ]
}
```

#### POST /memory/save

保存新记忆。

**请求体**:

```json
{
  "user_id": "user_xxx",
  "content": "用户提到他是程序员",
  "metadata": {
    "source": "chat",
    "chat_id": "chat_xxx"
  }
}
```

---

## 错误响应

所有 API 在发生错误时返回统一格式：

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "请求参数无效",
    "details": {
      "field": "message",
      "reason": "不能为空"
    }
  }
}
```

### 错误码

| 错误码 | HTTP 状态码 | 说明 |
|--------|-------------|------|
| `INVALID_REQUEST` | 400 | 请求参数无效 |
| `UNAUTHORIZED` | 401 | 未授权 |
| `FORBIDDEN` | 403 | 禁止访问 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `RATE_LIMITED` | 429 | 请求过于频繁 |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 |
| `SERVICE_UNAVAILABLE` | 503 | 服务不可用 |

---

## 认证

### Bearer Token

内部服务间通信使用 Bearer Token 认证：

```
Authorization: Bearer <INNER_HTTP_SECRET>
```

### 飞书签名验证

飞书回调请求使用签名验证：

1. 获取请求头中的 `X-Lark-Signature`
2. 使用 `timestamp + nonce + encrypt_key + body` 计算 SHA256
3. 比较签名是否匹配

---

## 速率限制

| 端点 | 限制 |
|------|------|
| `/chat/sse` | 10 请求/分钟/用户 |
| `/extract_batch` | 100 请求/分钟 |
| `/api/image/process` | 30 请求/分钟 |

超过限制时返回 `429 Too Many Requests`。

---

## WebSocket 接口

### 飞书 WebSocket 连接

Main Server 支持通过 WebSocket 接收飞书事件，适用于无法暴露公网 IP 的场景。

**连接地址**: 由飞书 SDK 自动管理

**事件格式**: 与 HTTP 回调相同

---

## API 文档

启动 AI Service 后，可以访问自动生成的 API 文档：

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
