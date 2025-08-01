# ADR-002: 选择NestJS作为应用框架

## 状态
已接受

## 背景
当前v1使用Koa.js作为Web框架，存在以下问题：
- 缺乏标准的项目结构，代码组织混乱
- 没有内置的依赖注入，导致手动管理依赖关系复杂
- 缺少开箱即用的功能（验证、管道、守卫等）
- 测试setup复杂，需要大量mock

## 决策
选择NestJS作为v2的应用框架。

## 理由
1. **模块化架构**：NestJS提供清晰的模块系统，与DDD的边界上下文契合
2. **依赖注入**：内置的DI容器简化了依赖管理，提高了可测试性
3. **装饰器支持**：使用装饰器定义路由、验证规则等，代码更简洁
4. **生态系统**：丰富的官方和社区模块（配置、健康检查、OpenAPI等）
5. **TypeScript优先**：完美的TypeScript支持，类型安全
6. **测试友好**：内置测试工具，易于编写单元测试和集成测试

## 后果
### 正面影响
- 标准化的项目结构，新人容易上手
- 依赖注入使代码更易测试和维护
- 丰富的中间件和拦截器机制
- 内置的异常过滤器统一错误处理
- 自动生成OpenAPI文档

### 负面影响
- 学习曲线：团队需要学习NestJS概念（模块、提供者、装饰器等）
- 框架开销：相比Koa更重，但性能仍然优秀
- 装饰器可能导致代码与框架耦合

## 迁移策略
1. 保持业务逻辑在领域层，与框架解耦
2. 控制器只做请求转发和响应格式化
3. 使用适配器模式封装外部服务调用
4. 逐步迁移，先实现核心功能

## 参考实现
```typescript
@Controller('webhook')
export class WebhookController {
  constructor(
    private readonly processMessageUseCase: ProcessMessageUseCase,
  ) {}

  @Post('lark/event')
  async handleLarkEvent(@Body() event: LarkEventDto) {
    const result = await this.processMessageUseCase.execute({
      messageId: event.message_id,
      // ...
    });
    return { success: result.success };
  }
}
```