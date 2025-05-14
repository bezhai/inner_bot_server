# TypeScript项目实体类型规范

## 背景

本项目在扩展过程中逐渐面临类型定义混乱、职责边界模糊的问题。为了提高代码质量和可维护性，特制定此规范，明确各类型的定义和使用场景。

## 实体类型定义

### 1. Entity（实体）

- **定义**：与数据库表对应的实体类
- **位置**：`src/dal/entities/`
- **命名**：直接使用业务含义命名，如`AIModel`、`LarkUser`
- **用途**：数据库表映射，ORM实体

```typescript
// 实体示例
@Entity('ai_model')
export class AIModel {
    @PrimaryColumn()
    model_id!: string;

    @Column({ type: 'varchar', length: 100 })
    name!: string;
    
    // ... 其他属性
}
```

### 2. DTO（数据传输对象）

- **定义**：服务间数据传递的对象
- **位置**：建议放在`src/dtos/`（目前项目中在`types`目录下）
- **命名**：根据用途命名，如`UserRequest`、`ModelResponse`
- **用途**：事件参数定义、API请求和响应

```typescript
// DTO示例
export interface CompletionRequest {
    model: string; 
    messages: Message[];
    temperature?: number; 
    // ... 其他属性
}
```

### 3. Model（领域模型）

- **定义**：业务对象，包含业务逻辑
- **位置**：`src/models/`
- **命名**：直接使用业务含义，如`Message`、`User`
- **用途**：封装核心业务逻辑，处理业务流程

```typescript
// model示例，目前项目中的Message类
export class Message {
    private metadata: MessageMetadata;
    private content: MessageContent;

    // 业务方法
    isP2P(): boolean {
        return MessageMetadataUtils.isP2P(this.metadata);
    }
    
    // ... 其他方法
}
```

### 4. Interface/Type（接口/类型）

- **定义**：类型声明
- **位置**：`src/types/`
- **命名**：根据业务含义命名，如`CompletionRequest`
- **用途**：通用类型定义

```typescript
// 接口定义示例
export interface Message {
    role: 'system' | 'user' | 'assistant';
    content: string | UserContent[];
    name?: string;
}
```

## 实际项目结构

基于当前项目目录结构：

```
src/
├── dal/                    # 数据访问层
│   ├── entities/           # 数据库实体
│   └── repositories/       # 数据访问仓储
├── models/                 # 领域模型
├── types/                  # 类型定义
├── services/               # 业务服务
├── middleware/             # 中间件 
├── utils/                  # 工具函数
├── events/                 # 事件处理
```

## 类型使用场景指南

### 1. 事件处理层

- **输入**：使用明确定义的DTO接口
- **内部处理**：转换为领域模型
- **输出**：生成标准响应格式

```typescript
// 事件处理示例
async function handleAIRequest(request: CompletionRequest): Promise<CompletionResponse> {
  // 处理请求
  const result = await processCompletion(request);
  
  // 返回结果
  return result;
}
```

### 2. 服务层

- 使用Model处理业务逻辑
- 通过Repository访问数据
- 返回业务结果

```typescript
// 服务层示例
async function processMessage(message: Message): Promise<ProcessResult> {
  // 业务逻辑处理
  const chatId = message.chatId;
  
  // 存储相关信息
  await repository.saveMessageInfo(chatId, message);
  
  // 返回结果
  return { success: true };
}
```

### 3. 数据访问层

- 使用Entity与数据库交互
- 返回实体或处理结果

```typescript
// 仓储示例
class UserRepository {
  async findById(id: string): Promise<LarkUser | null> {
    return await LarkUser.findOne({ where: { id } });
  }
}
```

## 类型转换建议

建议在不同类型间提供转换方法，减少重复代码：

```typescript
// Entity与Model转换示例
class MessageModel {
  static fromEntity(entity: MessageEntity): MessageModel {
    // 转换逻辑
    return new MessageModel(/* ... */);
  }
  
  toEntity(): MessageEntity {
    // 转换逻辑
    return new MessageEntity(/* ... */);
  }
}
```

## 最佳实践

1. **不用any**：能用明确类型就别用any，实在不行用unknown
2. **用Record代替object**：对于未知属性的对象，用`Record<string, unknown>`
3. **接口vs类型**：
   - 公共API用interface，支持扩展
   - 固定结构用type，更严格
4. **命名要明确**：类型名称应当能清晰表达其用途

## 待改进的问题

1. 目前`types`目录中混合了很多DTO和接口定义，可考虑分离
2. 部分业务逻辑散落在各处，应当集中到Model中
3. 缺少统一的Repository接口定义

## 总结

这套规范基于当前项目实际情况制定，目的是让代码结构更清晰，减少混乱。随着项目发展，我们会持续调整和完善这套规范。
