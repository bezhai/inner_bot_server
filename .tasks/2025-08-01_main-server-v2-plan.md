# main-server 重构路线图（2025-08-01）


## 战略原则
1. **架构先行**：先设计后编码，确保可扩展与可维护。
2. **TDD**：所有功能先写测试再实现代码，覆盖率目标 ≥ 90%。
3. **一次性重构**：v2开发完成后直接替换v1，保持数据库不变。
4. **自动化**：从 CI/CD、格式化到部署全链路自动化。

---

## 高层架构草图

### 🏗️ 目录结构设计（基于现有项目优化）
```
main-server-v2/
├── packages/
│   ├── core/                     # 核心业务领域
│   │   ├── domain/
│   │   │   ├── entities/         # 领域实体（基于现有Message等优化）
│   │   │   │   ├── user.entity.ts
│   │   │   │   ├── message.entity.ts      # 基于现有models/message.ts重构
│   │   │   │   ├── conversation.entity.ts
│   │   │   │   └── chat-permission.entity.ts
│   │   │   ├── value-objects/    # 值对象
│   │   │   │   ├── message-content.vo.ts   # 基于现有message-content.ts
│   │   │   │   ├── lark-ids.vo.ts
│   │   │   │   └── chat-config.vo.ts
│   │   │   ├── events/           # 领域事件
│   │   │   │   ├── message-received.event.ts
│   │   │   │   ├── user-mentioned.event.ts
│   │   │   │   └── conversation-closed.event.ts
│   │   │   └── repositories/     # 仓储接口
│   │   │       ├── user.repository.ts
│   │   │       ├── message.repository.ts
│   │   │       └── conversation.repository.ts
│   │   └── usecases/            # 应用用例（基于现有services/重构）
│   │       ├── message/
│   │       │   ├── process-message.usecase.ts    # 基于rule-engine.ts重构
│   │       │   ├── generate-reply.usecase.ts     # 基于services/ai/重构
│   │       │   └── handle-command.usecase.ts     # 基于admin规则重构
│   │       ├── user/
│   │       │   ├── manage-permissions.usecase.ts
│   │       │   └── sync-user-info.usecase.ts
│   │       └── chat/
│   │           ├── manage-group-settings.usecase.ts
│   │           └── generate-history.usecase.ts
│   ├── adapters/                # 适配器层
│   │   ├── http/
│   │   │   ├── controllers/
│   │   │   │   ├── webhook.controller.ts    # 基于现有index.ts重构
│   │   │   │   ├── health.controller.ts
│   │   │   │   └── admin.controller.ts      # 基于handlers/prompts.ts
│   │   │   ├── middlewares/
│   │   │   │   ├── auth.middleware.ts
│   │   │   │   ├── logging.middleware.ts    # 基于现有trace.ts
│   │   │   │   └── validation.middleware.ts
│   │   │   └── dto/
│   │   │       ├── lark-event.dto.ts
│   │   │       └── admin-command.dto.ts
│   │   ├── lark/                # Lark SDK适配（基于现有services/lark/）
│   │   │   ├── lark-webhook.adapter.ts
│   │   │   ├── lark-message.adapter.ts
│   │   │   └── lark-user.adapter.ts
│   │   └── ai/                  # AI服务适配
│   │       ├── ai-client.adapter.ts         # 连接现有ai-service
│   │       └── ai-response.mapper.ts
│   ├── infra/                   # 基础设施层
│   │   ├── database/
│   │   │   ├── prisma/
│   │   │   │   ├── schema.prisma           # 基于现有entities/重新设计
│   │   │   │   └── migrations/
│   │   │   ├── repositories/               # 实现domain中的接口
│   │   │   │   ├── user.repository.impl.ts
│   │   │   │   ├── message.repository.impl.ts
│   │   │   │   └── conversation.repository.impl.ts
│   │   │   └── mongo/           # MongoDB适配（渐进迁移）
│   │   │       └── message-meta.repository.ts  # 基于现有dal/mongo/
│   │   ├── cache/
│   │   │   ├── redis.service.ts            # 基于现有dal/redis.ts
│   │   │   └── cache.repository.ts
│   │   ├── queue/
│   │   │   ├── message-queue.service.ts
│   │   │   └── job-processor.ts
│   │   └── external/
│   │       ├── lark-api.client.ts          # 基于现有integrations/
│   │       └── ai-service.client.ts        # 连接Python ai-service
│   └── shared/                  # 共享模块
│       ├── config/
│       │   ├── app.config.ts
│       │   └── database.config.ts
│       ├── logger/
│       │   └── winston.logger.ts           # 基于现有utils/logger.ts
│       ├── utils/
│       │   ├── crypto.util.ts
│       │   └── validation.util.ts
│       └── decorators/
│           ├── trace.decorator.ts          # 基于现有middleware/trace.ts
│           └── retry.decorator.ts
```

### 🛠️ 技术选型（基于现有项目优化）
- **语言**：TypeScript 5.6.3（当前版本）
- **运行时**：Node.js LTS + pnpm workspaces
- **框架**：NestJS 10（替换当前Koa.js，更好的模块化和DI）
- **ORM**：Prisma 5（替换TypeORM，更好的类型安全和开发体验）
- **数据库**：PostgreSQL（主） + MongoDB（渐进迁移）
- **缓存**：Redis（复用现有ioredis配置）
- **队列**：BullMQ（基于现有Redis）
- **测试**：Jest + Supertest（保持现有测试框架）
- **AI集成**：保持现有Python ai-service，通过HTTP适配
- **飞书集成**：复用现有@larksuiteoapi/node-sdk
- **打包**：保持现有构建方式，后续优化为esbuild

---

## 里程碑
| Milestone | 目标 | 交付物 | 预计工期 |
|-----------|------|--------|----------|
| M0        | 基础设施就绪 | monorepo 结构、工具链、CI scaffold | 2d |
| M1        | 核心域建模   | 领域实体、用例接口定义、UML 图 | 3d |
| M2        | 框架落地     | NestJS 模块骨架，启动脚本 | 3d |
| M3        | 核心用例实现 | 消息处理 pipeline v2，AI 调用 adapter | 5d |
| M4        | 外设集成     | 数据库适配、外部 API client、缓存集成 | 4d |
| M5        | 集成测试     | E2E测试、性能验证、生产环境验证 | 2d |
| M6        | 部署上线     | v2部署替换v1，监控稳定 | 1d |

---

## 任务拆解
### M0 基础设施就绪
- [ ] 引入 **pnpm workspaces**，目录结构：
  ```
  main-server/
    packages/
      core/      // domain + usecase
      adapters/  // http, queue, cli
      infra/     // prisma, redis, s3 ...
      shared/
  ```
- [ ] 配置 **eslint, prettier, lint-staged, husky**
- [ ] 创建 **GitHub Actions** CI：install → lint → test → build
- [ ] Dockerfile.multi-stage & docker-compose.override.yml (dev env)
- [ ] 创建根级 `tsconfig.base.json` 并在各 package 继承
- [ ] 安装依赖：`pnpm add -D typescript jest ts-jest @types/jest eslint prettier lint-staged husky commitizen commitlint cz-conventional-changelog`
- [ ] 在 `package.json` 添加 script：`dev`, `lint`, `test`, `test:watch`, `build`, `release`
- [ ] 编写 `.prettierrc.json`：2 空格缩进、行宽 120、单引号
- [ ] 更新 `.eslintrc.js`：启用 `@typescript-eslint`, `import/order`, `unused-imports` 规则
- [ ] `husky install` 并添加 `pre-commit`、`commit-msg` 钩子
- [ ] CI: `.github/workflows/ci.yml` Node 20 matrix，步骤：checkout→setup-pnpm→cache→install→lint→test→upload-codecov
- [ ] 新建 `Dockerfile.dev`：基于 node:20-alpine，热重载 `pnpm run dev`
- [ ] README 增加本地启动、调试、测试、CI 说明

### M1 核心域建模（基于现有业务逻辑重构）
- [ ] **领域实体重构**（基于现有models/重新设计）
  - [ ] `MessageEntity`：基于现有`Message`类，提取纯业务逻辑
    - 保留核心方法：`texts()`, `clearText()`, `hasMention()`, `toMarkdown()`
    - 增加领域逻辑：`shouldTriggerReply()`, `extractCommands()`, `isFromAdmin()`
  - [ ] `UserEntity`：基于现有`LarkUser`实体优化
    - 增加权限判断：`canExecuteAdminCommands()`, `hasAccessToChat()`
  - [ ] `ConversationEntity`：基于现有chat概念抽象
    - 群聊配置：`isRepeatEnabled()`, `getPermissionConfig()`
    - 历史管理：`canGenerateHistory()`, `getRecentMessages()`

- [ ] **值对象设计**（基于现有数据结构）
  - [ ] `MessageContent`：基于现有`MessageContent`类优化
    - 支持多媒体：文本、图片、贴纸
    - 提及处理：`@mentions`解析和验证
  - [ ] `LarkIdentifiers`：统一ID管理
    - `UnionId`, `OpenId`, `ChatId`, `MessageId`
  - [ ] `ChatPermissions`：基于现有权限配置
    - 复读权限、管理员权限、功能开关

- [ ] **规则引擎重构**（基于现有rule-engine.ts）
  - [ ] 抽象现有规则为领域服务
    - `RepeatMessageRule`: 基于现有复读逻辑
    - `AdminCommandRule`: 基于现有管理员命令
    - `AIReplyRule`: 基于现有AI回复逻辑
    - `MediaProcessRule`: 基于现有图片/Meme处理
  - [ ] 规则执行引擎：`RuleExecutor`
    - 支持规则链：同步规则 + 异步规则
    - 支持fallthrough：规则通过后继续执行

- [ ] **领域事件定义**（基于现有业务流程）
  - [ ] `MessageReceivedEvent`：消息接收事件
  - [ ] `UserMentionedEvent`：用户被提及事件  
  - [ ] `AdminCommandExecutedEvent`：管理员命令执行事件
  - [ ] `AIReplyGeneratedEvent`：AI回复生成事件
  - [ ] `RepeatMessageTriggeredEvent`：复读触发事件

- [ ] **用例接口定义**（基于现有services/）
  - [ ] `ProcessMessageUseCase`：核心消息处理流程
  - [ ] `GenerateAIReplyUseCase`：AI回复生成
  - [ ] `HandleAdminCommandUseCase`：管理员命令处理
  - [ ] `ManageGroupSettingsUseCase`：群组设置管理
  - [ ] `ProcessMediaContentUseCase`：多媒体内容处理

- [ ] **仓储接口设计**
  - [ ] `MessageRepository`：消息存储接口
    - `save()`, `findById()`, `findByConversation()`, `findDuplicates()`
  - [ ] `UserRepository`：用户信息接口
    - `save()`, `findByUnionId()`, `batchGetUserNames()`
  - [ ] `ConversationRepository`：会话管理接口
    - `save()`, `findByChatId()`, `updatePermissions()`

- [ ] **架构决策记录（ADR）**
  - [ ] ADR-001：采用领域驱动设计（DDD）
  - [ ] ADR-002：选择NestJS作为应用框架
  - [ ] ADR-003：Prisma替换TypeORM的决策
  - [ ] ADR-004：保持Python AI服务独立的决策
  - [ ] ADR-005：渐进式数据库迁移策略

- [ ] **领域模型文档**
  - [ ] 使用C4 Model绘制系统上下文图
  - [ ] 绘制容器图：main-server-v2与ai-service的关系
  - [ ] 创建领域模型类图（基于现有Message/User等）
  - [ ] 事件风暴输出：业务流程和领域事件映射

### M2 框架落地
- [ ] 选择 & 初始化 NestJS / DI 容器
- [ ] 实现跨切面中间件：Logging, Validation, ExceptionFilter
- [ ] configuration module 统一 env 读取
- [ ] Bootstrapping: graceful shutdown, health check endpoint
- [ ] 安装 NestJS 依赖：`@nestjs/{core,common,testing}`, `reflect-metadata`, `class-validator`
- [ ] 建立 `app.module.ts`，导入 Controllers & Providers skeleton
- [ ] 创建全局管道：`ValidationPipe`、`LoggingInterceptor`
- [ ] 配置 `ConfigModule.forRoot({ isGlobal:true, envFilePath:['.env','.env.local']})`
- [ ] `main.ts` 启动脚本：启用 CORS、graceful shutdown、swagger `@/docs`
- [ ] 编写 `health.controller.ts` 返回 build info
- [ ] 单元测试 `health.controller.spec.ts`

### M3 核心用例实现（TDD - 基于现有rule-engine.ts重构）

#### 🚀 **消息处理流水线重构**（基于现有规则引擎）
- [ ] **核心流水线设计**
  ```typescript
  // packages/core/usecases/message/process-message.usecase.ts
  export class ProcessMessageUseCase {
    constructor(
      private readonly ruleEngine: MessageRuleEngine,
      private readonly messageRepo: MessageRepository,
      private readonly userRepo: UserRepository,
      private readonly eventBus: EventBus,
    ) {}

    async execute(command: ProcessMessageCommand): Promise<ProcessMessageResult> {
      // 1. 解析消息
      const message = await this.parseMessage(command)
      
      // 2. 丰富上下文
      const enrichedMessage = await this.enrichContext(message)
      
      // 3. 执行规则引擎
      const ruleResult = await this.ruleEngine.execute(enrichedMessage)
      
      // 4. 发布领域事件
      await this.publishEvents(ruleResult)
      
      return ruleResult
    }
  }
  ```

#### 🎯 **规则引擎v2设计**（基于现有chatRules优化）
- [ ] **规则抽象接口**
  ```typescript
  // packages/core/domain/rules/rule.interface.ts
  export interface MessageRule {
    name: string
    priority: number
    canHandle(message: MessageEntity): Promise<boolean>
    handle(message: MessageEntity): Promise<RuleResult>
  }
  
  export interface RuleResult {
    shouldContinue: boolean
    actions: RuleAction[]
    events: DomainEvent[]
  }
  ```

- [ ] **具体规则实现**（基于现有规则逻辑）
  - [ ] `RepeatMessageRule`：基于现有复读逻辑
    ```typescript
    export class RepeatMessageRule implements MessageRule {
      async canHandle(message: MessageEntity): Promise<boolean> {
        return message.isInGroup() && 
               !message.isMentioned() && 
               await this.isRepeatEnabled(message.chatId)
      }
      
      async handle(message: MessageEntity): Promise<RuleResult> {
        // 基于现有 repeatMessage 逻辑实现
      }
    }
    ```
  
  - [ ] `AdminCommandRule`：基于现有管理员命令
    ```typescript
    export class AdminCommandRule implements MessageRule {
      async canHandle(message: MessageEntity): Promise<boolean> {
        return message.isMentioned() && 
               message.isFromAdmin() && 
               message.isCommand()
      }
    }
    ```
  
  - [ ] `AIReplyRule`：基于现有AI回复逻辑
    ```typescript
    export class AIReplyRule implements MessageRule {
      async canHandle(message: MessageEntity): Promise<boolean> {
        return message.isMentioned() && 
               message.isTextOnly()
      }
    }
    ```

#### 🤖 **AI适配器设计**（连接现有ai-service）
- [ ] **AI服务接口抽象**
  ```typescript
  // packages/core/domain/services/ai.service.ts
  export interface AIService {
    generateReply(request: AIReplyRequest): Promise<AIReplyResponse>
    extractEntities(text: string): Promise<ExtractedEntity[]>
    generateMeme(prompt: string): Promise<MemeGenerationResult>
  }
  
  export interface AIReplyRequest {
    message: MessageEntity
    conversation: ConversationEntity
    context: ConversationContext
  }
  ```

- [ ] **AI适配器实现**（连接Python ai-service）
  ```typescript
  // packages/adapters/ai/ai-service.adapter.ts
  export class AIServiceAdapter implements AIService {
    constructor(private readonly httpClient: HttpClient) {}
    
    async generateReply(request: AIReplyRequest): Promise<AIReplyResponse> {
      // 调用现有 ai-service/app/api/chat.py
      const response = await this.httpClient.post('/api/chat', {
        message: request.message.toMarkdown(),
        chat_id: request.conversation.chatId,
        user_id: request.message.senderId,
      })
      
      return this.mapResponse(response.data)
    }
  }
  ```

#### ⚡ **限流器实现**（基于现有Redis）
- [ ] **Token Bucket算法**
  ```typescript
  // packages/core/domain/services/rate-limiter.service.ts
  export class RateLimiterService {
    constructor(private readonly redis: RedisService) {}
    
    async checkLimit(key: string, limit: number, window: number): Promise<boolean> {
      const current = await this.redis.incr(`rate_limit:${key}`)
      if (current === 1) {
        await this.redis.expire(`rate_limit:${key}`, window)
      }
      return current <= limit
    }
  }
  ```

#### 🧪 **TDD测试用例**（先写测试，红绿重构）
- [ ] **消息处理流水线测试**
  ```typescript
  // packages/core/usecases/message/__tests__/process-message.usecase.spec.ts
  describe('ProcessMessageUseCase', () => {
    describe('when receiving a mention message', () => {
      it('should trigger AI reply generation', async () => {
        // Arrange
        const message = MessageEntityBuilder.create()
          .withMention(botOpenId)
          .withText('你好')
          .build()
        
        mockRuleEngine.execute.mockResolvedValue({
          shouldContinue: false,
          actions: [new GenerateAIReplyAction(message)],
          events: [new MessageProcessedEvent(message.id)]
        })
        
        // Act
        const result = await useCase.execute({ message })
        
        // Assert
        expect(result.actions).toHaveLength(1)
        expect(result.actions[0]).toBeInstanceOf(GenerateAIReplyAction)
      })
    })
    
    describe('when receiving a repeat message', () => {
      it('should trigger repeat if enabled', async () => {
        // 基于现有复读逻辑的测试
      })
    })
    
    describe('when receiving admin command', () => {
      it('should execute admin command', async () => {
        // 基于现有管理员命令的测试
      })
    })
  })
  ```

- [ ] **规则引擎测试**
  ```typescript
  // packages/core/domain/rules/__tests__/repeat-message.rule.spec.ts
  describe('RepeatMessageRule', () => {
    it('should repeat message when conditions met', async () => {
      // 基于现有复读逻辑测试
    })
    
    it('should not repeat when bot is mentioned', async () => {
      // 测试边界条件
    })
  })
  ```

- [ ] **AI适配器测试**
  ```typescript
  // packages/adapters/ai/__tests__/ai-service.adapter.spec.ts
  describe('AIServiceAdapter', () => {
    it('should call ai-service and return formatted response', async () => {
      // Mock HTTP调用
      mockHttpClient.post.mockResolvedValue({
        data: { reply: 'AI generated response' }
      })
      
      const result = await adapter.generateReply(mockRequest)
      
      expect(mockHttpClient.post).toHaveBeenCalledWith('/api/chat', {
        message: 'user message',
        chat_id: 'chat123',
        user_id: 'user123'
      })
      expect(result.content).toBe('AI generated response')
    })
    
    it('should handle ai-service errors gracefully', async () => {
      // 测试错误处理
    })
  })
  ```

#### 🔄 **重试机制与错误处理**
- [ ] **重试装饰器**
  ```typescript
  // packages/shared/decorators/retry.decorator.ts
  export function Retry(options: RetryOptions) {
    return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
      const originalMethod = descriptor.value
      
      descriptor.value = async function (...args: any[]) {
        let lastError: Error
        
        for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
          try {
            return await originalMethod.apply(this, args)
          } catch (error) {
            lastError = error
            if (attempt < options.maxAttempts) {
              await this.delay(options.backoffMs * Math.pow(2, attempt - 1))
            }
          }
        }
        
        throw lastError
      }
    }
  }
  ```

- [ ] **断路器模式**（保护AI服务调用）
  ```typescript
  // packages/adapters/ai/circuit-breaker.ts
  export class CircuitBreaker {
    private failureCount = 0
    private lastFailureTime: Date | null = null
    private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED'
    
    async execute<T>(operation: () => Promise<T>): Promise<T> {
      if (this.state === 'OPEN') {
        if (this.shouldAttemptReset()) {
          this.state = 'HALF_OPEN'
        } else {
          throw new Error('Circuit breaker is OPEN')
        }
      }
      
      try {
        const result = await operation()
        this.onSuccess()
        return result
      } catch (error) {
        this.onFailure()
        throw error
      }
    }
  }
  ```

#### 📊 **性能监控与指标**
- [ ] **性能指标收集**
  ```typescript
  // packages/shared/decorators/metrics.decorator.ts
  export function Metrics(metricName: string) {
    return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
      const originalMethod = descriptor.value
      
      descriptor.value = async function (...args: any[]) {
        const startTime = Date.now()
        try {
          const result = await originalMethod.apply(this, args)
          // 记录成功指标
          this.metricsService.recordDuration(metricName, Date.now() - startTime)
          this.metricsService.incrementCounter(`${metricName}.success`)
          return result
        } catch (error) {
          // 记录错误指标
          this.metricsService.incrementCounter(`${metricName}.error`)
          throw error
        }
      }
    }
  }
  ```

### M4 外设集成（基于现有数据结构优化）

#### 🗄️ **Prisma Schema设计**（基于现有TypeORM entities）
- [ ] **核心数据模型迁移**
  ```prisma
  // packages/infra/database/prisma/schema.prisma
  generator client {
    provider = "prisma-client-js"
  }

  datasource db {
    provider = "postgresql"
    url      = env("DATABASE_URL")
  }

  // 基于现有LarkUser实体
  model LarkUser {
    unionId      String   @id @map("union_id")
    name         String
    avatarOrigin String?  @map("avatar_origin")
    isAdmin      Boolean  @default(false) @map("is_admin")
    createdAt    DateTime @default(now()) @map("created_at")
    updatedAt    DateTime @updatedAt @map("updated_at")

    // 关系
    openIds      LarkUserOpenId[]
    chatMappings UserChatMapping[]
    groupBindings UserGroupBinding[]
    feedbacks    ResponseFeedback[]

    @@map("lark_user")
  }

  // 基于现有LarkUserOpenId实体
  model LarkUserOpenId {
    openId    String   @id @map("open_id")
    unionId   String   @map("union_id")
    createdAt DateTime @default(now()) @map("created_at")

    user LarkUser @relation(fields: [unionId], references: [unionId], onDelete: Cascade)

    @@map("lark_user_open_id")
  }

  // 基于现有LarkBaseChatInfo实体
  model LarkBaseChatInfo {
    chatId           String   @id @map("chat_id")
    name             String?
    chatType         String   @map("chat_type")
    ownerOpenId      String?  @map("owner_open_id")
    permissionConfig Json?    @map("permission_config")
    createdAt        DateTime @default(now()) @map("created_at")
    updatedAt        DateTime @updatedAt @map("updated_at")

    // 关系
    members      LarkGroupMember[]
    chatMappings UserChatMapping[]
    cardContexts LarkCardContext[]

    @@map("lark_base_chat_info")
  }

  // 基于现有消息处理逻辑设计
  model Message {
    id            String   @id @default(cuid())
    messageId     String   @unique @map("message_id") // Lark消息ID
    chatId        String   @map("chat_id")
    senderId      String   @map("sender_id")
    content       Json     // 结构化消息内容
    metadata      Json     // 消息元数据
    processed     Boolean  @default(false) // 是否已处理
    createdAt     DateTime @default(now()) @map("created_at")

    // 索引优化
    @@index([chatId, createdAt])
    @@index([senderId])
    @@index([processed])
    @@map("messages")
  }

  // 基于现有Prompt实体
  model Prompt {
    id          Int      @id @default(autoincrement())
    name        String   @unique
    description String?
    content     String
    isActive    Boolean  @default(true) @map("is_active")
    createdAt   DateTime @default(now()) @map("created_at")
    updatedAt   DateTime @updatedAt @map("updated_at")

    @@map("prompts")
  }
  ```

#### 🔄 **数据库直接切换**
- [ ] **Prisma Schema映射现有表结构**
  - [ ] 使用`prisma db pull`从现有数据库生成初始schema
  - [ ] 调整字段映射：确保与现有TypeORM实体一致
  - [ ] 保持所有表名、字段名完全一致
  - [ ] 验证生成的Prisma Client与现有数据完全兼容

- [ ] **Repository实现**
  - [ ] 直接实现Prisma版本的Repository
  - [ ] 保持接口方法签名与现有逻辑一致
  - [ ] 单元测试确保数据访问行为一致

- [ ] **集成测试验证**
  - [ ] 使用现有数据库运行完整测试套件
  - [ ] 验证所有CRUD操作正常
  - [ ] 确保关联查询和复杂查询正确

#### 🏪 **Repository Pattern实现**
- [ ] **消息仓储**（基于现有Message处理逻辑）
  ```typescript
  // packages/infra/database/repositories/message.repository.impl.ts
  export class MessageRepositoryImpl implements MessageRepository {
    async save(message: MessageEntity): Promise<void>
    async findById(id: string): Promise<MessageEntity | null>
    async findByConversation(chatId: string, limit: number): Promise<MessageEntity[]>
    async findDuplicates(content: string, chatId: string): Promise<MessageEntity[]>
    async markAsProcessed(messageId: string): Promise<void>
  }
  ```

- [ ] **用户仓储**（基于现有用户管理）
  ```typescript
  export class UserRepositoryImpl implements UserRepository {
    async save(user: UserEntity): Promise<void>
    async findByUnionId(unionId: string): Promise<UserEntity | null>
    async findByOpenId(openId: string): Promise<UserEntity | null>
    async batchGetUserNames(unionIds: string[]): Promise<Map<string, string>>
    async updateAdminStatus(unionId: string, isAdmin: boolean): Promise<void>
  }
  ```

#### 🔌 **外部适配器实现**
- [ ] **Lark Webhook适配器**（基于现有webhook处理）
  ```typescript
  // packages/adapters/lark/lark-webhook.adapter.ts
  export class LarkWebhookAdapter {
    async handleMessageEvent(event: LarkMessageEvent): Promise<void>
    async handleCardActionEvent(event: LarkCardActionEvent): Promise<void>
    async validateSignature(signature: string, body: string): boolean
  }
  ```

- [ ] **AI服务适配器**（连接现有Python ai-service）
  ```typescript
  // packages/adapters/ai/ai-client.adapter.ts
  export class AIClientAdapter {
    async generateReply(message: MessageEntity, context: ConversationContext): Promise<AIResponse>
    async extractEntities(text: string): Promise<ExtractedEntity[]>
    async generateMeme(prompt: string): Promise<MemeResult>
  }
  ```

#### 🏗️ **基础设施服务**
- [ ] **Redis服务**（基于现有dal/redis.ts优化）
  - [ ] 连接池管理
  - [ ] 缓存策略：用户信息、群组配置、消息去重
  - [ ] 分布式锁：防止重复处理
  - [ ] 限流器：基于Redis实现token bucket

- [ ] **队列服务**
  - [ ] 消息处理队列：异步处理复杂逻辑
  - [ ] 延时任务：定时清理、统计报告
  - [ ] 死信队列：处理失败消息

#### 🧪 **集成测试**
- [ ] **数据库测试**
  - [ ] 使用testcontainers启动PostgreSQL
  - [ ] 每个测试独立的数据库实例
  - [ ] 数据工厂：生成测试数据

- [ ] **E2E测试**
  - [ ] 模拟Lark webhook调用
  - [ ] 验证完整的消息处理流程
  - [ ] AI服务mock：稳定的测试环境

- [ ] **性能测试**
  - [ ] 消息处理吞吐量测试
  - [ ] 并发用户测试
  - [ ] 内存泄漏检测

#### 🐳 **容器化与CI**
- [ ] **Docker Compose配置**
  ```yaml
  # docker-compose.ci.yml
  services:
    postgres:
      image: postgres:15-alpine
      environment:
        POSTGRES_DB: test_db
        POSTGRES_USER: test_user
        POSTGRES_PASSWORD: test_pass
    
    redis:
      image: redis:7-alpine
      command: redis-server --appendonly yes
    
    test-runner:
      build: .
      depends_on: [postgres, redis]
      environment:
        DATABASE_URL: postgresql://test_user:test_pass@postgres:5432/test_db
        REDIS_URL: redis://redis:6379
  ```

### M5 迁移网关
- [ ] 在 v1 前端/客户端侧增加 `X-API-Version` header
- [ ] 网关根据 header 将请求路由至 v2
- [ ] 监控指标：Latency, ErrorRate, Throughput
- [ ] 灰度策略：10%→25%→50%→100%
- [ ] Nginx ingress：配置 `map $http_x_api_version` 路由 v1/v2
- [ ] `k8s/deployment.yaml` 增加 v2 canary，flagger 分阶段自动放量
- [ ] 实现 `traffic-mirror` middleware 记录并对比 v1/v2 响应差异
- [ ] Prometheus & Grafana dashboard：延迟 p95、错误率、RPS
- [ ] 自动回滚脚本 on SLO breach

### M6 全量迁移 & 收尾
- [ ] 切流完成，关闭 v1
- [ ] 数据备份与只读模式
- [ ] 更新文档 & 交接
- [ ] 归档旧仓库 / tag v1-legacy
- [ ] 编写 `scripts/data-backfill.ts` 校验并补齐 v1 与 v2 数据差异
- [ ] 执行 `kubectl rollout restart` 并观察 1h
- [ ] 发版公告 & 更新内部 Wiki
- [ ] 关闭 v1 相关 CI job、归档镜像
- [ ] post-mortem：复盘本次迁移，收集改进点

---

## 测试策略
1. **单元**：function/class 级，mock 依赖
2. **集成**：module 与外设交互 (db redis)
3. **契约**：对外 API pact 保证兼容性
4. **e2e**：通过 HTTP 验证主要用户路径
5. **覆盖率门槛**：90% stmt, 85% branch

---

## CI/CD Pipeline
```mermaid
flowchart LR
    A[Commit] --> B[GitHub Actions]
    B --> C[Lint & Test]
    C --> |OK| D[Build Docker]
    D --> E[Publish ghcr.io]
    E --> F[Deploy k8s Canary]
```

---

## 风险与应对
| 风险 | 等级 | 缓解措施 |
| ---- | ---- | -------- |
| v2 进度拖延 | 高 | 每周里程碑 Demo & Retro |
| 需求变更 | 中 | 模块化 + 领域驱动设计，降低影响面 |
| 迁移数据不一致 | 高 | 双写 + 数据校验脚本 |
| 团队不熟悉 NestJS | 中 | 内部 workshop & code-kata |

---

## 验收标准
- [ ] v2 生产流量 100%，SLA ≥ v1
- [ ] 覆盖率 & 静态扫描通过
- [ ] ADR & 文档完备，On-call 能独立处理告警

---

## 📋 执行总结

### 🎯 **重构价值**
基于对现有v1项目的深入分析，此次v2重构将带来以下价值：

1. **架构优化**：从Koa单体架构升级到NestJS模块化架构，提升可维护性
2. **类型安全**：从TypeORM迁移到Prisma，获得更好的类型安全和开发体验  
3. **业务抽象**：基于现有规则引擎重构为领域驱动设计，业务逻辑更清晰
4. **测试覆盖**：引入TDD开发模式，确保代码质量和回归测试
5. **性能提升**：优化数据访问模式，引入缓存和队列机制

### 🔧 **现有资产复用**
- **业务逻辑**：复用现有Message处理逻辑、规则引擎、AI集成逻辑
- **数据模型**：基于现有TypeORM实体设计Prisma schema
- **外部集成**：保持Lark SDK、Python ai-service集成
- **基础设施**：复用现有Redis、PostgreSQL、MongoDB配置

### 🚦 **迁移策略**
- **一次性替换**：v2开发完成后直接替换v1部署
- **数据兼容性**：Prisma直接连接现有数据库，保持完全兼容
- **功能对等**：确保v2功能完全覆盖v1，无功能缺失
- **监控保障**：完整的监控指标和告警机制

### 📈 **技术债务清理**
- **统一代码风格**：eslint + prettier + husky规范
- **模块边界清晰**：Clean Architecture分层设计
- **依赖注入**：NestJS DI容器替代手动依赖管理
- **错误处理**：统一异常处理和重试机制

### 🔮 **后续扩展**
v2架构为后续功能扩展奠定基础：
- 支持更多IM平台（钉钉、企微等）
- AI能力扩展（多模态、工具调用等）
- 微服务化拆分（用户服务、消息服务等）
- 事件驱动架构完善（CQRS、Event Sourcing）

---

### 维护者
@backend-team

### 文档版本
- v1.0 (2025-08-01): 初始重构计划
- v1.1 (2025-08-02): 基于现有项目分析的详细技术方案
