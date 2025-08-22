"""
工具状态消息服务
管理不同工具调用时的状态显示文案
"""


class ToolStatusService:
    """工具状态消息服务"""

    # 工具状态消息映射，基于实际注册的工具，考虑到赤尾是人类美少女的设定
    TOOL_STATUS_MESSAGES: dict[str, str] = {
        # 搜索相关工具
        "search_web": "让我来搜搜看~",
        "search_donjin_event": "哇！看起来跟同人有关系！让我找找！",
        # 话题总结工具
        "topic_summary": "让小尾回忆一下~",
        # Bangumi相关工具
        "bangumi_search": "让小尾查查Bangumi~",
    }

    # 默认状态消息
    DEFAULT_STATUS_MESSAGES = {
        "thinking": "小尾正在努力思考...🤔",
        "replying": "小尾正在努力打字✍️",
        "tool_calling": "看我的独家秘技！✨",
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
            tool_name, cls.DEFAULT_STATUS_MESSAGES["tool_calling"]
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
            status_type, cls.DEFAULT_STATUS_MESSAGES["thinking"]
        )
