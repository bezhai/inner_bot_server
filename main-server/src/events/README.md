# 事件订阅装饰器

通过简单的装饰器方式订阅事件系统中的事件，支持延迟注册模式。

## 使用方法

### 1. 在类中使用装饰器定义事件处理方法

```typescript
import { Subscribe } from './events';

class MyService {
  // 使用装饰器标记事件处理方法
  @Subscribe('eventName')
  handleEvent(data: any) {
    console.log('收到事件:', data);
    // 处理事件逻辑
  }
}

// 创建服务实例
const service = new MyService();
```

### 2. 在事件系统初始化好后，手动激活所有事件订阅

```typescript
import { initEventSubscriptions } from './events';

// 在应用启动时，事件系统准备好后调用
function startApp() {
  // ... 其他初始化逻辑
  
  // 初始化所有事件订阅
  initEventSubscriptions();
}
```

### 3. 应用关闭时，清除所有事件订阅

```typescript
import { clearEventSubscriptions } from './events';

// 在应用关闭时调用
function stopApp() {
  // 清除所有事件订阅
  clearEventSubscriptions();
  
  // ... 其他清理逻辑
}
```

## 注意事项

1. 装饰器会在声明时立即订阅事件，无需手动调用任何方法
2. 目前没有自动取消订阅的机制，如需取消订阅，请手动调用 `unsubscribeEvent`
3. 如果需要在特定时机订阅/取消订阅，请直接使用 `subscribeEvent`/`unsubscribeEvent` 函数

## 功能特性

- 使用 `@Subscribe` 装饰器轻松订阅事件
- 自动在组件初始化时订阅事件
- 自动在组件销毁时取消事件订阅
- 基于 TypeScript 装饰器实现，提供类型安全
- 完全兼容现有的事件系统

## 安装依赖

确保项目中安装了 `reflect-metadata` 库：

```bash
npm install reflect-metadata --save
```

并在项目入口文件中导入：

```typescript
import 'reflect-metadata';
```

## 配置 tsconfig.json

确保在 `tsconfig.json` 中启用了装饰器支持：

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    // 其他配置...
  }
}
```

## 示例

请参考 `example.ts` 文件，其中包含完整的使用示例：

```typescript
import { EventHandlerService, exampleUsage } from './events/example';

// 直接调用示例函数
exampleUsage();

// 或者创建自己的服务实例
const myService = new EventHandlerService();
myService.onInit();
// ...
myService.onDestroy();
```

## 内部实现

装饰器使用 `reflect-metadata` 库存储元数据，然后在服务的生命周期中自动处理事件的订阅和取消订阅。这使得代码更加简洁和声明式，同时减少了手动管理事件订阅的复杂性。

## 工作原理

1. `@Subscribe` 装饰器在类加载时，将事件处理函数存储在内存中的待注册列表
2. `initEventSubscriptions()` 方法在事件系统初始化好后，将所有待注册的事件处理函数注册到事件系统
3. `clearEventSubscriptions()` 方法可以清除所有注册的事件订阅

这种方式解决了事件系统初始化时机的问题，避免了过早调用 `getEventSystem()` 导致的错误。
