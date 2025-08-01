# ADR-003: Prisma替换TypeORM的决策

## 状态
已接受

## 背景
v1使用TypeORM作为ORM，在使用过程中遇到以下问题：
- TypeORM的装饰器方式定义实体，导致领域模型与数据库模型耦合
- 复杂查询的类型推断不够准确
- 迁移管理较为复杂，特别是在团队协作时
- 性能问题：N+1查询问题难以发现和解决

## 决策
在v2中使用Prisma替换TypeORM。

## 理由
1. **类型安全**：Prisma生成的客户端提供完美的类型推断
2. **Schema优先**：使用声明式的schema定义，更清晰直观
3. **性能优化**：内置的查询优化，避免N+1问题
4. **迁移管理**：更好的迁移工具，支持自动生成和手动编辑
5. **开发体验**：Prisma Studio提供可视化数据管理界面
6. **与DDD契合**：数据模型与领域模型分离，通过映射层转换

## 后果
### 正面影响
- 更好的类型安全，减少运行时错误
- 查询性能提升，特别是复杂关联查询
- 开发效率提升，自动补全和类型提示
- 迁移更可控，易于团队协作
- 数据库模型与领域模型解耦

### 负面影响
- 需要学习Prisma的schema语法
- 某些高级特性（如自定义SQL）支持有限
- 生成的客户端代码增加构建时间

## 实施方案
1. **Schema映射**：将现有TypeORM实体转换为Prisma schema
2. **Repository实现**：使用Prisma Client实现领域层定义的Repository接口
3. **数据映射**：创建mapper将Prisma模型转换为领域实体
4. **保持兼容**：确保数据库结构与v1完全兼容，实现无缝切换

## 示例
```prisma
// schema.prisma
model LarkUser {
  unionId      String   @id @map("union_id")
  name         String
  avatarOrigin String?  @map("avatar_origin")
  isAdmin      Boolean  @default(false) @map("is_admin")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  @@map("lark_user")
}
```

```typescript
// Repository实现
export class UserRepositoryImpl implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByUnionId(unionId: string): Promise<UserEntity | null> {
    const user = await this.prisma.larkUser.findUnique({
      where: { unionId },
      include: { openIds: true }
    });
    
    return user ? this.toDomainEntity(user) : null;
  }
  
  private toDomainEntity(dbUser: any): UserEntity {
    return new UserEntity({
      unionId: dbUser.unionId,
      name: dbUser.name,
      // ... 映射其他字段
    });
  }
}
```
