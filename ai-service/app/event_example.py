import logging
import asyncio
from typing import Dict, Any

# 导入事件系统
from app.event_system import init_event_system as init_system, get_event_system

# 导入装饰器模块
from app.event_decorator import (
    subscribe, 
    init_event_subscriptions,
    clear_event_subscriptions, 
    EventSubscriber,
    register_instance
)

# 设置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# 示例1: 使用函数装饰器
@subscribe("global_event")
def handle_global_event(data: Any) -> None:
    """处理全局事件的函数"""
    logger.info(f"全局事件处理: {data}")
    return "全局处理结果"


# 示例2: 使用类方法装饰器（普通类）
class NormalService:
    """普通服务类，需要手动注册"""

    def __init__(self, name: str):
        self.name = name
        
    @subscribe("user_created")
    def handle_user_created(self, data: Dict[str, Any]) -> None:
        """处理用户创建事件"""
        logger.info(f"[{self.name}] 用户创建事件: {data}")
        return f"{self.name}处理了用户创建事件"
        
    @subscribe("message_received")
    def handle_message(self, data: Dict[str, Any]) -> None:
        """处理消息接收事件"""
        logger.info(f"[{self.name}] 消息接收事件: {data}")
        return f"{self.name}处理了消息事件"


# 示例3: 继承EventSubscriber的类（自动注册）
class AutoService(EventSubscriber):
    """自动注册事件的服务类"""
    
    def __init__(self, name: str):
        self.name = name
        super().__init__()  # 必须调用父类初始化，触发事件注册
        
    @subscribe("data_processed")
    def handle_data_processed(self, data: Any) -> None:
        """处理数据处理完成事件"""
        logger.info(f"[{self.name}] 数据处理事件: {data}")
        return f"{self.name}处理了数据事件"
        
    # 异步方法示例
    @subscribe("async_event")
    async def handle_async_event(self, data: Any) -> None:
        """异步处理事件"""
        logger.info(f"[{self.name}] 开始异步处理: {data}")
        await asyncio.sleep(1)  # 模拟异步操作
        logger.info(f"[{self.name}] 异步处理完成: {data}")
        return f"{self.name}异步处理了事件"
        
    def regular_method(self, data: Any) -> None:
        """普通方法，不会被注册为事件处理函数"""
        logger.info(f"普通方法调用: {data}")


async def run_example():
    """运行示例代码"""
    # 1. 初始化事件系统
    logger.info("1. 初始化事件系统")
    init_system(service_name="example-service")
    
    # 2. 创建服务实例
    logger.info("\n2. 创建服务实例")
    normal_service = NormalService("普通服务")
    auto_service = AutoService("自动服务")  # 自动注册事件
    
    # 3. 为普通服务注册事件
    logger.info("\n3. 手动注册普通服务的事件")
    register_instance(normal_service)
    
    # 4. 初始化所有事件订阅
    logger.info("\n4. 初始化所有事件订阅")
    init_event_subscriptions()
    
    # 确保事件系统已启动
    event_system = get_event_system()
    await event_system.start()
    
    # 5. 发布事件并查看结果
    logger.info("\n5. 发布事件并查看结果")
    
    # 发布全局事件
    await event_system.publish("global_event", {"id": 1, "type": "global"})
    logger.info("全局事件已发布")
    
    # 发布用户创建事件
    await event_system.publish("user_created", {"id": 1, "name": "测试用户"})
    logger.info("用户创建事件已发布")
    
    # 发布消息接收事件
    await event_system.publish("message_received", {"id": 1, "content": "你好!"})
    logger.info("消息接收事件已发布")
    
    # 发布数据处理事件
    await event_system.publish("data_processed", {"id": 1, "status": "success"})
    logger.info("数据处理事件已发布")
    
    # 发布异步处理事件
    await event_system.publish("async_event", {"id": 1, "operation": "async"})
    logger.info("异步事件已发布")
    
    # 等待异步事件处理完成
    await asyncio.sleep(2)
    
    # 6. 清除所有事件订阅
    logger.info("\n6. 清除所有事件订阅")
    clear_event_subscriptions()
    
    # 7. 再次发布事件，应该没有处理函数
    logger.info("\n7. 清除后再次发布事件（没有处理函数）")
    await event_system.publish("user_created", {"id": 2, "name": "另一个用户"})
    logger.info("清除后事件已发布")
    
    logger.info("\n示例运行完成!")


if __name__ == "__main__":
    asyncio.run(run_example()) 