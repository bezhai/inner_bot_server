## 缓存装饰器用法

在 `cache-decorator.ts` 提供了通用缓存装饰器 `@cache`，支持本地缓存和 Redis 缓存。

### 用法示例

```ts
import { cache } from './cache-decorator';

class UserService {
  @cache({ type: 'redis', ttl: 60 })
  async getUserName(userId: number): Promise<string> {
    // ... 查询数据库或远程接口 ...
    return 'xxx';
  }

  @cache({ type: 'local', ttl: 30 })
  async getUserProfile(userId: number): Promise<any> {
    // ... 查询数据库 ...
    return {};
  }
}
```

- `type`: 'local' 使用本地缓存，'redis' 使用 Redis 缓存
- `ttl`: 缓存过期时间（秒）
- key 由函数名和参数序列化自动生成
