"""
核心模块，包含核心功能实现，如事件系统。
"""

from app.core.event_system import (
    init_event_system,
    get_event_system,
    register_group,
    unregister_group,
    publish_group_event,
)

__all__ = [
    "init_event_system",
    "get_event_system",
    "register_group",
    "unregister_group",
    "publish_group_event",
]
