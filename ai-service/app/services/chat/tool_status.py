"""
工具状态消息服务
管理不同工具调用时的状态显示文案
"""

from typing import Dict


class ToolStatusService:
    """工具状态消息服务"""
    
    # 工具状态消息映射，基于实际注册的工具，考虑到赤尾是人类美少女的设定
    TOOL_STATUS_MESSAGES: Dict[str, str] = {
        # 搜索相关工具
        "search_web": "赤尾正在努力上网搜索~",
        "search_donjin_event": "赤尾正在查找同人活动信息...",
        
        # 话题总结工具
        "topic_summary": "赤尾正在整理话题总结呢...",
        
        # Bangumi相关工具
        "bangumi_search": "赤尾正在查询ACG信息~",
        "search_characters": "赤尾正在搜索角色信息...",
        "search_persons": "赤尾正在查找人物资料...",
        "get_subject_characters": "赤尾正在获取角色列表...",
        "get_subject_relations": "赤尾正在查找相关作品...",
        "get_subject_persons": "赤尾正在获取制作人员信息...",
        "get_character_subjects": "赤尾正在查找角色出演作品...",
        "get_character_persons": "赤尾正在获取角色声优信息...",
        "get_person_characters": "赤尾正在查找配音角色...",
        "get_person_subjects": "赤尾正在查找参与作品...",
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