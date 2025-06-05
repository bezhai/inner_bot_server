"""
服务模块，包含业务逻辑服务，如AI聊天服务。
"""
from .message_handler import message_handler  # 导入消息处理器实例，触发自动注册
from .search import *  # 导入搜索服务, 触发自动注册