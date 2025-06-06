import asyncio
import json
import logging
import uuid
import time
from typing import Any, Callable, Dict, List, Optional, Union, TypeVar, Generic
from app.services.meta_info import AsyncRedisClient
from app.core.group_stream import (
    get_group_stream_manager,
    register_group,
    unregister_group,
    publish_group_event,
)

# 设置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("event_system")

# 自定义类型
T = TypeVar("T")
EventHandler = Callable[[Any], Union[Any, asyncio.Future]]


class EventData:
    """事件数据结构"""

    def __init__(
        self,
        event_type: str,
        payload: Any,
        source: str,
        event_id: str = None,
        group_id: str = None,
        timestamp: float = None,
        expire_at: float = None,
    ):
        self.id = event_id or str(uuid.uuid4())
        self.type = event_type
        self.source = source
        self.timestamp = timestamp or time.time() * 1000  # 毫秒时间戳
        self.group_id = group_id
        self.payload = payload
        self.expire_at = expire_at

    def to_dict(self) -> dict:
        """转换为字典格式"""
        return {
            "id": self.id,
            "type": self.type,
            "source": self.source,
            "timestamp": self.timestamp,
            "groupId": self.group_id,
            "payload": self.payload,
            "expireAt": self.expire_at,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "EventData":
        """从字典创建事件数据"""
        return cls(
            event_type=data.get("type"),
            payload=data.get("payload"),
            source=data.get("source"),
            event_id=data.get("id"),
            group_id=data.get("groupId"),
            timestamp=data.get("timestamp"),
            expire_at=data.get("expireAt"),
        )

    def to_json(self) -> str:
        """转换为JSON字符串"""
        return json.dumps(self.to_dict())

    @classmethod
    def from_json(cls, json_str: str) -> "EventData":
        """从JSON字符串创建事件数据"""
        data = json.loads(json_str)
        return cls.from_dict(data)


class EventResponse:
    """事件响应数据结构"""

    def __init__(self, success: bool, data: Any = None, error: str = None):
        self.success = success
        self.data = data
        self.error = error

    def to_dict(self) -> dict:
        """转换为字典格式"""
        return {
            "success": self.success,
            "data": self.data,
            "error": self.error,
        }


class ResponseFuture(asyncio.Future, Generic[T]):
    """用于等待事件响应的Future"""

    def __init__(self, timeout: float = 30.0):
        super().__init__()
        self.timeout = timeout
        self._timeout_handle = None

    def set_timeout(self, loop: asyncio.AbstractEventLoop = None):
        """设置超时处理"""
        if loop is None:
            loop = asyncio.get_event_loop()

        self._timeout_handle = loop.call_later(self.timeout, self._timeout_callback)

    def _timeout_callback(self):
        """超时回调函数"""
        if not self.done():
            self.set_exception(asyncio.TimeoutError(f"事件处理超时: {self.timeout}秒"))

    def cancel_timeout(self):
        """取消超时处理"""
        if self._timeout_handle:
            self._timeout_handle.cancel()
            self._timeout_handle = None


class EventSystem:
    """事件系统

    支持三种模式：
    1. 广播模式 - 通过 publish 发布事件
    2. 请求-响应模式 - 通过 publish_and_wait 发布事件并等待响应
    3. 分组顺序消费模式 - 通过 register_group 注册分组，通过 publish_group_event 发布事件，使用 subscribe 注册处理函数

    推荐使用方式：
    1. 使用 subscribe 统一注册事件处理函数
    2. 使用 register_group/unregister_group 管理分组消费状态
    3. 使用 publish_group_event 发布分组事件
    """

    def __init__(
        self,
        service_name: str,
        service_id: str = None,
        default_ttl: float = 30.0,
    ):
        self.service_name = service_name
        self.service_id = service_id or str(uuid.uuid4())
        self.default_ttl = default_ttl  # 默认超时时间(秒)

        # Redis客户端
        self.redis = None

        # 事件处理器
        self.handlers: Dict[str, List[EventHandler]] = {}

        # 等待响应的请求
        self.response_futures: Dict[str, ResponseFuture] = {}

        # 事件循环
        self.loop = asyncio.get_event_loop()

        # 标记是否已启动
        self.started = False

        self.group_stream_manager = get_group_stream_manager()

        logger.info(f"事件系统初始化: 服务={service_name}, ID={self.service_id}")

    async def start(self):
        """启动事件系统"""
        if self.started:
            return

        try:
            # 获取已有的Redis客户端实例
            self.redis = AsyncRedisClient.get_instance()
            logger.info("Redis客户端已获取")

            # 启动消息处理任务
            self.loop.create_task(self._process_redis_messages())
            # 启动 group stream manager
            await self.group_stream_manager.start()
        except Exception as e:
            logger.error(f"获取Redis客户端失败: {e}")

        self.started = True

    async def stop(self):
        """停止事件系统"""
        if not self.started:
            return

        # 取消所有等待中的future
        for future in self.response_futures.values():
            if not future.done():
                future.cancel()

        # 停止 group stream manager
        await self.group_stream_manager.stop()

        self.started = False
        logger.info("事件系统已停止")

    async def _process_redis_messages(self):
        """处理从Redis接收的消息"""
        try:
            # 创建发布/订阅对象
            pubsub = self.redis.pubsub()

            # 监听模式: event:*
            await pubsub.psubscribe("event:*")

            # 持续处理消息
            async for message in pubsub.listen():
                logger.info(f"收到消息: {message}")

                if message["type"] != "pmessage":
                    continue

                try:
                    channel = message["channel"]
                    data = message["data"]

                    # 解析事件数据
                    event_data = EventData.from_json(data)

                    # 忽略自己发出的事件
                    if event_data.source == self.service_id:
                        continue

                    # 检查事件是否过期
                    if event_data.expire_at and event_data.expire_at < (
                        time.time() * 1000
                    ):
                        logger.info(f"事件已过期: {event_data.id}")
                        continue

                    # 解析频道名: event:类型:请求/响应
                    parts = channel.split(":")
                    if len(parts) < 3:
                        continue

                    prefix, event_type, mode = parts

                    # 处理响应消息
                    if mode == "response":
                        request_id = event_data.group_id
                        if not request_id:
                            continue

                        future = self.response_futures.get(request_id)
                        if future and not future.done():
                            response = event_data.payload
                            if response.get("success"):
                                future.set_result(response.get("data"))
                            else:
                                future.set_exception(
                                    Exception(response.get("error", "未知错误"))
                                )

                            future.cancel_timeout()
                            self.response_futures.pop(request_id, None)
                        continue

                    # 处理请求消息
                    handlers = self.handlers.get(event_type, [])
                    for handler in handlers:
                        try:
                            # 异步执行处理器
                            result = handler(event_data.payload)
                            if asyncio.iscoroutine(result):
                                result = await result

                            # 如果是请求-响应模式，发送响应
                            if mode == "request" and event_data.id:
                                response_channel = f"event:{event_type}:response"
                                response_data = EventData(
                                    event_type=event_type,
                                    payload={"success": True, "data": result},
                                    source=self.service_id,
                                    group_id=event_data.id,
                                )

                                await self.redis.publish(
                                    response_channel, response_data.to_json()
                                )
                        except Exception as e:
                            logger.error(f"处理事件 {event_type} 时出错: {e}")

                            # 如果是请求-响应模式，发送错误响应
                            if mode == "request" and event_data.id:
                                response_channel = f"event:{event_type}:response"
                                response_data = EventData(
                                    event_type=event_type,
                                    payload={"success": False, "error": str(e)},
                                    source=self.service_id,
                                    group_id=event_data.id,
                                )

                                await self.redis.publish(
                                    response_channel, response_data.to_json()
                                )
                except Exception as e:
                    logger.error(f"处理Redis消息失败: {e}")
        except Exception as e:
            logger.error(f"Redis消息处理任务异常: {e}")
        finally:
            # 确保取消订阅
            if "pubsub" in locals():
                await pubsub.punsubscribe("event:*")
                await pubsub.close()

    def subscribe(self, event_type: str, handler: EventHandler):
        """订阅事件

        Args:
            event_type: 事件类型
            handler: 事件处理函数，可以是同步或异步函数
        """
        if event_type not in self.handlers:
            self.handlers[event_type] = []

        self.handlers[event_type].append(handler)
        logger.info(f"已订阅事件: {event_type}")

        return self

    def unsubscribe(self, event_type: str, handler: Optional[EventHandler] = None):
        """取消订阅事件

        Args:
            event_type: 事件类型
            handler: 事件处理函数，如果为None则取消所有处理函数
        """
        if handler is None:
            self.handlers.pop(event_type, None)
        else:
            handlers = self.handlers.get(event_type, [])
            self.handlers[event_type] = [h for h in handlers if h != handler]

            if not self.handlers[event_type]:
                self.handlers.pop(event_type, None)

        logger.info(f"已取消订阅事件: {event_type}")

        return self

    async def publish(
        self,
        event_type: str,
        data: Any,
        group_id: str = None,
        ttl: float = None,
        local_only: bool = False,
    ):
        """广播模式：发布事件，不等待结果

        Args:
            event_type: 事件类型
            data: 事件数据
            group_id: 事件组ID
            ttl: 超时时间(秒)
            local_only: 是否仅本地处理
        """
        if not self.started:
            await self.start()

        ttl = ttl or self.default_ttl
        event_id = str(uuid.uuid4())
        timestamp = time.time() * 1000  # 毫秒时间戳

        # 创建事件数据
        event_data = EventData(
            event_type=event_type,
            payload=data,
            source=self.service_id,
            event_id=event_id,
            group_id=group_id,
            timestamp=timestamp,
            expire_at=timestamp + (ttl * 1000),  # 毫秒
        )

        # 本地处理
        if event_type in self.handlers:
            for handler in self.handlers[event_type]:
                try:
                    # 提交任务到事件循环，不等待结果
                    result = handler(data)
                    if asyncio.iscoroutine(result):
                        self.loop.create_task(result)
                except Exception as e:
                    logger.error(f"处理本地事件 {event_type} 时出错: {e}")

        # 如果不是仅本地处理且有Redis连接，则发布到Redis
        if not local_only and self.redis:
            channel = f"event:{event_type}:request"
            await self.redis.publish(channel, event_data.to_json())

    async def publish_and_wait(
        self,
        event_type: str,
        data: Any,
        group_id: str = None,
        ttl: float = None,
        local_only: bool = False,
    ) -> Any:
        """请求-响应模式：发布事件并等待结果

        Args:
            event_type: 事件类型
            data: 事件数据
            group_id: 事件组ID
            ttl: 超时时间(秒)
            local_only: 是否仅本地处理

        Returns:
            处理结果
        """
        if not self.started:
            await self.start()

        ttl = ttl or self.default_ttl
        event_id = str(uuid.uuid4())
        timestamp = time.time() * 1000  # 毫秒时间戳

        # 创建事件数据
        event_data = EventData(
            event_type=event_type,
            payload=data,
            source=self.service_id,
            event_id=event_id,
            group_id=group_id,
            timestamp=timestamp,
            expire_at=timestamp + (ttl * 1000),  # 毫秒
        )

        # 如果有本地处理器，优先使用本地处理
        if event_type in self.handlers and self.handlers[event_type]:
            try:
                # 使用第一个处理器处理事件
                handler = self.handlers[event_type][0]
                result = handler(data)
                if asyncio.iscoroutine(result):
                    result = await result
                return result
            except Exception as e:
                logger.error(f"处理本地事件 {event_type} 时出错: {e}")
                raise

        # 如果本地没有处理器或必须通过Redis处理
        if (not local_only or event_type not in self.handlers) and self.redis:
            # 创建一个Future用于等待响应
            future = ResponseFuture(timeout=ttl)
            future.set_timeout(self.loop)

            # 存储Future
            self.response_futures[event_id] = future

            try:
                # 发布请求到Redis
                channel = f"event:{event_type}:request"
                await self.redis.publish(channel, event_data.to_json())

                # 等待响应
                return await future
            except asyncio.CancelledError:
                # 请求被取消
                self.response_futures.pop(event_id, None)
                raise
            except asyncio.TimeoutError:
                # 请求超时
                self.response_futures.pop(event_id, None)
                raise asyncio.TimeoutError(f"处理事件 {event_type} 超时")
            except Exception as e:
                # 其他错误
                self.response_futures.pop(event_id, None)
                raise

        raise Exception(f"没有可用的事件处理器: {event_type}")


# 单例模式
_event_system = None


def init_event_system(
    service_name: str,
    service_id: str = None,
    default_ttl: float = 30.0,
) -> EventSystem:
    """初始化事件系统

    Args:
        service_name: 服务名称
        service_id: 服务实例ID，默认自动生成
        default_ttl: 默认超时时间(秒)

    Returns:
        事件系统实例
    """
    global _event_system
    if _event_system is not None:
        raise RuntimeError("事件系统已初始化")

    _event_system = EventSystem(
        service_name=service_name,
        service_id=service_id,
        default_ttl=default_ttl,
    )

    return _event_system


def get_event_system() -> EventSystem:
    """获取事件系统实例"""
    global _event_system
    if _event_system is None:
        raise RuntimeError("事件系统尚未初始化，请先调用 init_event_system")

    return _event_system


# 导出分组顺序消费的相关方法
__all__ = [
    "init_event_system",
    "get_event_system",
    "register_group",
    "unregister_group",
    "publish_group_event",
]
