from typing import Any, Callable, Dict, List, TypeVar
import functools
import inspect
import logging
import asyncio
from weakref import WeakKeyDictionary

# 导入现有的事件系统
from app.core.event_system import get_event_system

# 设置日志
logger = logging.getLogger(__name__)

# 类型定义
EventHandler = Callable[[Any], Any]
T = TypeVar('T')

# 存储待注册的事件处理函数
_pending_handlers: List[Dict[str, Any]] = []

# 标记是否已初始化
_initialized = False

# 存储实例和对应的处理函数，使用弱引用字典避免内存泄漏
_instance_handlers = WeakKeyDictionary()


def subscribe(event_type: str):
    """
    事件订阅装饰器
    
    用法:
    @subscribe("event_name")
    def handle_event(data):
        # 处理事件逻辑
        pass
        
    类方法也支持:
    @subscribe("event_name")
    def handle_event(self, data):
        # 处理事件逻辑
        pass
        
    异步方法也支持:
    @subscribe("event_name")
    async def handle_event(self, data):
        # 异步处理事件逻辑
        pass
    """
    def decorator(func: Callable) -> Callable:
        # 获取函数签名，判断是否为类方法（第一个参数是self）
        sig = inspect.signature(func)
        params = list(sig.parameters.values())
        is_method = params and params[0].name in ('self', 'cls')
        is_async = asyncio.iscoroutinefunction(func)
        
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            # 调用原始函数
            return func(*args, **kwargs)
            
        # 保存事件类型和原始函数的信息
        wrapper.__event_type__ = event_type
        wrapper.__original_func__ = func
        wrapper.__is_method__ = is_method
        wrapper.__is_async__ = is_async
        
        # 如果是普通函数（非类方法），直接添加到待注册列表
        if not is_method:
            _pending_handlers.append({
                'event_type': event_type,
                'handler': func,
                'is_method': False,
                'is_async': is_async,
                'func_name': func.__name__
            })
            logger.info(f"函数 {func.__name__} 已添加到待注册列表: {event_type}")
        else:
            # 如果是类方法，记录信息等待类实例化时处理
            _pending_handlers.append({
                'event_type': event_type,
                'handler': None,  # 暂时为空，实例化时设置
                'is_method': True,
                'is_async': is_async,
                'func_name': func.__name__,
                'original_func': func
            })
            logger.info(f"类方法 {func.__name__} 已添加到待注册列表: {event_type}")
            
        return wrapper
    
    return decorator


def _register_instance_handlers(instance: Any) -> None:
    """注册实例的所有事件处理方法"""
    
    # 如果实例已经注册过，不需要重复注册
    if instance in _instance_handlers:
        return
        
    # 记录实例的处理函数
    _instance_handlers[instance] = []
    
    # 查找实例中所有带有 __event_type__ 属性的方法
    for name, method in inspect.getmembers(instance):
        if hasattr(method, '__event_type__'):
            event_type = method.__event_type__
            original_func = method.__original_func__
            is_async = getattr(method, '__is_async__', False)
            
            # 创建绑定了实例的处理函数
            bound_handler = functools.partial(original_func, instance)
            
            # 记录事件处理函数，便于后续取消订阅
            _instance_handlers[instance].append({
                'event_type': event_type, 
                'handler': bound_handler,
                'is_async': is_async
            })
            
            # 如果事件系统已初始化，直接订阅
            if _initialized:
                try:
                    event_system = get_event_system()
                    event_system.subscribe(event_type, bound_handler)
                    logger.info(f"类 {instance.__class__.__name__} 的方法 {original_func.__name__} 已订阅事件: {event_type}")
                except RuntimeError:
                    logger.warning(f"事件系统尚未初始化，方法 {original_func.__name__} 将在初始化后订阅")


def register_instance(instance: Any) -> Any:
    """
    注册实例的所有事件处理方法
    
    用法:
    service = register_instance(MyService())
    """
    _register_instance_handlers(instance)
    return instance


class EventSubscriber:
    """
    自动注册事件的基类
    
    用法:
    class MyService(EventSubscriber):
        @subscribe("event_name")
        def handle_event(self, data):
            pass
    
    service = MyService()  # 自动注册所有事件
    """
    def __new__(cls, *args, **kwargs):
        instance = super().__new__(cls)
        return instance
        
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # 初始化时自动注册事件
        _register_instance_handlers(self)


def init_event_subscriptions() -> None:
    """初始化所有事件订阅"""
    global _initialized
    
    if _initialized:
        logger.info("事件订阅已初始化，跳过")
        return
    
    # 确保事件系统已初始化
    try:
        event_system = get_event_system()
        
        logger.info(f"开始注册 {len(_pending_handlers)} 个事件处理函数")
        
        # 注册非类方法的处理函数
        for info in _pending_handlers:
            if not info['is_method'] and info['handler'] is not None:
                event_system.subscribe(info['event_type'], info['handler'])
                logger.info(f"已注册事件: {info['event_type']}")
        
        # 注册已经创建的实例的方法
        for instance, handlers in _instance_handlers.items():
            for info in handlers:
                event_system.subscribe(info['event_type'], info['handler'])
                logger.info(f"已注册实例事件: {info['event_type']}")
        
        _initialized = True
        logger.info("所有事件订阅已初始化")
    except RuntimeError as e:
        logger.error(f"初始化事件订阅失败: {e}")
        raise


def clear_event_subscriptions() -> None:
    """清除所有事件订阅"""
    global _initialized
    
    if not _initialized:
        return
    
    try:
        event_system = get_event_system()
        
        # 清除所有实例的订阅
        for instance, handlers in _instance_handlers.items():
            for info in handlers:
                event_system.unsubscribe(info['event_type'], info['handler'])
        
        # 清除非类方法的订阅
        for info in _pending_handlers:
            if not info['is_method'] and info['handler'] is not None:
                event_system.unsubscribe(info['event_type'], info['handler'])
        
        _initialized = False
        logger.info("所有事件订阅已清除")
    except RuntimeError as e:
        logger.error(f"清除事件订阅失败: {e}") 