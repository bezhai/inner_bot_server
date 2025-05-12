import asyncio
import json
import logging
from typing import Any, Callable, Dict, Optional, Set
from app.services.meta_info import AsyncRedisClient

logger = logging.getLogger("group_stream")

class GroupStreamManager:
    def __init__(self, default_timeout: float = 30.0):
        self.redis = None
        self.handlers: Dict[str, Callable[[Any], Any]] = {}
        self.group_tasks: Dict[str, asyncio.Task] = {}
        self.active_groups: Set[str] = set()
        self.default_timeout = default_timeout
        self._group_change_task = None
        self._started = False

    async def start(self):
        if self._started:
            return
        self.redis = AsyncRedisClient.get_instance()
        self._group_change_task = asyncio.create_task(self._group_change_listener())
        self._started = True
        logger.info("GroupStreamManager started.")

    async def stop(self):
        if not self._started:
            return
        if self._group_change_task:
            self._group_change_task.cancel()
        for task in self.group_tasks.values():
            task.cancel()
        self.group_tasks.clear()
        self.active_groups.clear()
        self._started = False
        logger.info("GroupStreamManager stopped.")

    def register_handler(self, topic: str, handler: Callable[[Any], Any]):
        self.handlers[topic] = handler
        logger.info(f"Registered group stream handler for topic: {topic}")

    async def _group_change_listener(self):
        pubsub = self.redis.pubsub()
        await pubsub.subscribe("group_change")
        async for msg in pubsub.listen():
            if msg["type"] != "message":
                continue
            try:
                info = json.loads(msg["data"])
                topic = info["topic"]
                group_id = info["group_id"]
                action = info["action"]
                key = f"{topic}:{group_id}"
                if action == "register":
                    if key not in self.active_groups:
                        self.active_groups.add(key)
                        self.group_tasks[key] = asyncio.create_task(self._group_consumer(topic, group_id))
                        logger.info(f"Started group consumer for {key}")
                elif action == "unregister":
                    if key in self.active_groups:
                        self.active_groups.remove(key)
                        task = self.group_tasks.pop(key, None)
                        if task:
                            task.cancel()
                        logger.info(f"Stopped group consumer for {key}")
            except Exception as e:
                logger.error(f"Error in group_change_listener: {e}")

    async def _group_consumer(self, topic: str, group_id: str):
        stream_key = f"event_stream:{topic}:{group_id}"
        last_id = "$"
        while True:
            try:
                events = await self.redis.xread({stream_key: last_id}, block=int(self.default_timeout * 1000), count=10)
                if not events:
                    continue
                for stream, entries in events:
                    for entry_id, entry in entries:
                        try:
                            data = json.loads(entry.get("data") or entry.get(b"data").decode())
                            await self._dispatch_to_handler(topic, data)
                            last_id = entry_id
                        except Exception as e:
                            logger.error(f"Error handling group event: {e}")
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Group consumer error: {e}")
                await asyncio.sleep(1)

    async def _dispatch_to_handler(self, topic: str, data: Any):
        handler = self.handlers.get(topic)
        if handler:
            result = handler(data)
            if asyncio.iscoroutine(result):
                await result
        else:
            logger.warning(f"No handler for group stream topic: {topic}")

# 装饰器注册
_group_stream_manager: Optional[GroupStreamManager] = None

def get_group_stream_manager() -> GroupStreamManager:
    global _group_stream_manager
    if _group_stream_manager is None:
        _group_stream_manager = GroupStreamManager()
    return _group_stream_manager

def group_event_handler(topic: str):
    def decorator(func):
        get_group_stream_manager().register_handler(topic, func)
        return func
    return decorator 