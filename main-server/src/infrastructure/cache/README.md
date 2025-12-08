# 缓存装饰器

`@cache` 装饰器用于缓存异步/同步函数的返回结果，支持本地内存与 Redis 两种后端。

## 使用

```typescript
import { cache } from './cache-decorator';

class DataService {
  // Redis 后端，缓存 1 小时
  @cache({ type: 'redis', ttl: 3600 })
  async getSomeData(id: string): Promise<any> {
    // 例如：耗时的数据库查询
  }

  // 本地内存缓存 30 秒
  @cache({ type: 'local', ttl: 30 })
  computeHotValue(key: string): number {
    // 计算型函数
    return Math.random();
  }
}
```

### 选项

- `type`: 缓存后端类型，`local` | `redis`
- `ttl`: 过期时间（秒）

### Key 生成

默认根据 类名 + 方法名 + 参数序列化 生成，例如：
`DataService:getSomeData:["123"]`

### 注意事项

- `redis` 模式依赖全局 Redis 客户端/连接配置，应在应用启动阶段完成初始化
- 建议为返回值较大或不易序列化的场景谨慎开启缓存
- 对于与用户权限相关的接口，请将权限相关信息纳入参数，避免不同权限命中同一缓存