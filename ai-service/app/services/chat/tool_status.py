"""
工具状态消息服务
管理不同工具调用时的状态显示文案
"""

from typing import Dict


class ToolStatusService:
    """工具状态消息服务"""
    
    # 工具状态消息映射，考虑到赤尾是人类美少女的设定
    TOOL_STATUS_MESSAGES: Dict[str, str] = {
        "search_web": "赤尾正在努力上网搜索~",
        "web_search": "赤尾正在努力上网搜索~",
        "topic_summary": "赤尾正在整理话题总结呢...",
        "get_weather": "赤尾正在查看天气预报~",
        "get_time": "赤尾正在确认时间...",
        "calculator": "赤尾正在认真计算中...",
        "image_generation": "赤尾正在画画呢，请稍等~",
        "file_upload": "赤尾正在处理文件...",
        "database_query": "赤尾正在查询数据库...",
        "email_send": "赤尾正在发送邮件...",
        "translation": "赤尾正在翻译中...",
        "code_execution": "赤尾正在运行代码...",
        "memory_search": "赤尾正在回忆相关内容...",
        "knowledge_base": "赤尾正在查阅知识库...",
    }
    
    # 默认状态消息
    DEFAULT_STATUS_MESSAGES = {
        "thinking": "赤尾思考中...",
        "replying": "赤尾回复中...",
        "tool_calling": "赤尾正在调用工具...",
    }
    
    @classmethod
    def get_tool_status_message(cls, tool_name: str) -> str:
        """
        根据工具名称获取状态消息
        
        Args:
            tool_name: 工具名称
            
        Returns:
            对应的状态消息
        """
        return cls.TOOL_STATUS_MESSAGES.get(
            tool_name, 
            cls.DEFAULT_STATUS_MESSAGES["tool_calling"]
        )
    
    @classmethod
    def get_default_status_message(cls, status_type: str) -> str:
        """
        获取默认状态消息
        
        Args:
            status_type: 状态类型 (thinking, replying, tool_calling)
            
        Returns:
            对应的状态消息
        """
        return cls.DEFAULT_STATUS_MESSAGES.get(
            status_type, 
            cls.DEFAULT_STATUS_MESSAGES["thinking"]
        )