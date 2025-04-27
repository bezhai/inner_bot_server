# Python事件订阅装饰器

这个模块提供了一个基于装饰器的事件订阅机制，可以轻松地将函数和方法注册为事件处理器，与现有的事件系统无缝集成。

## 功能特性

- 使用简洁的装饰器语法订阅事件
- 支持函数、类方法和异步方法的事件订阅
- 提供延迟注册机制，解决初始化时序问题
- 使用弱引用避免内存泄漏
- 支持自动注册的继承模式
- 完全集成到现有的事件系统中

## 使用方法

### 基本用法

有三种主要的使用方式：

#### 1. 装饰普通函数

```python
from app.event_decorator import subscribe

@subscribe("event_name")
def handle_event(data):
    print(f"处理事件: {data}")
    return "处理结果"
```

#### 2. 装饰类方法

```python
from app.event_decorator import subscribe, register_instance

class MyService:
    def __init__(self, name):
        self.name = name
        
    @subscribe("user_created")
    def handle_user_created(self, data):
        print(f"[{self.name}] 处理用户创建事件: {data}")
        return "处理结果"

# 创建实例并注册其事件处理方法
service = MyService("测试服务")
register_instance(service)
```

#### 3. 使用自动注册基类

```python
from app.event_decorator import subscribe, EventSubscriber

class MyService(EventSubscriber):
    def __init__(self, name):
        self.name = name
        super().__init__()  # 必须调用父类初始化以触发事件注册
        
    @subscribe("data_processed")
    def handle_data(self, data):
        print(f"[{self.name}] 处理数据: {data}")
        return "处理结果"

# 创建实例时会自动注册事件处理方法
service = MyService("自动服务")
```

#### 4. 支持异步方法

```python
from app.event_decorator import subscribe

class AsyncService(EventSubscriber):
    @subscribe("async_event")
    async def handle_async_event(self, data):
        print(f"开始异步处理: {data}")
        await asyncio.sleep(1)  # 异步操作
        print(f"异步处理完成: {data}")
        return "异步处理结果"
```

### 初始化和清理

为了解决事件系统初始化时序问题，需要在应用启动时正确初始化：

```python
from app.event_system import init_event_system
from app.event_decorator import init_event_subscriptions

# 应用启动时
async def start_app():
    # 1. 初始化事件系统
    init_event_system(service_name="my-service")
    
    # 2. 创建各种服务实例...
    
    # 3. 初始化所有事件订阅
    init_event_subscriptions()
    
    # 4. 启动事件系统
    event_system = get_event_system()
    await event_system.start()
```

在应用关闭时清理事件订阅：

```python
from app.event_decorator import clear_event_subscriptions

async def stop_app():
    # 清理所有事件订阅
    clear_event_subscriptions()
    
    # 停止事件系统
    event_system = get_event_system()
    await event_system.stop()
```

## 与现有事件系统的集成

本装饰器模块与 `app.event_system` 中的事件系统完全集成，使用了相同的事件处理和发布机制。当您通过装饰器订阅事件时，它会自动将您的处理函数注册到事件系统中。

主要区别在于：

- 装饰器提供了更简洁的语法和自动注册功能
- 支持延迟注册，解决初始化时序问题
- 提供了类实例自动注册机制

## 工作原理

1. 装饰器将事件处理函数存储在待注册列表中
2. 对于类方法，装饰器记录函数信息，等待类实例化
3. 当服务实例创建时，可以手动注册或通过 EventSubscriber 基类自动注册
4. 调用 `init_event_subscriptions()` 时，所有待注册的处理函数被正式注册到事件系统

## 完整示例

请查看 `event_example.py` 文件，其中包含了完整的使用示例：

```bash
# 运行示例
python -m app.event_example
```
