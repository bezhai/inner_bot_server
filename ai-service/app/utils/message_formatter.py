"""
消息格式化工具模块

提供统一的消息格式化函数，用于将结构化消息转换为可读的字符串格式。
支持时间戳、用户名、回复关系等信息的格式化。
"""

from datetime import datetime


def format_message_to_str(
    content: str,
    role: str,
    index: int,
    username: str | None = None,
    create_time: datetime | None = None,
    reply_index: int | None = None,
    include_timestamp: bool = True,
) -> str:
    """
    将单条消息格式化为字符串

    Args:
        content: 消息内容
        role: 角色（user/assistant）
        username: 用户名（user角色时使用，assistant时忽略）
        create_time: 消息创建时间
        reply_index: 回复的消息索引（如果是回复消息）
        include_timestamp: 是否包含时间戳

    Returns:
        格式化的消息字符串

    Examples:
        >>> format_message_to_str("你好", "user", "张三", datetime(2025, 1, 24, 10, 30, 15))
        '[2025-01-24 10:30:15] [User: 张三]: 你好'

        >>> format_message_to_str("很好", "user", "李四", datetime(2025, 1, 24, 10, 30, 20), reply_index=1)
        '[2025-01-24 10:30:20] [User: 李四] [↪️回复消息1]: 很好'

        >>> format_message_to_str("我来帮你", "assistant", create_time=datetime(2025, 1, 24, 10, 30, 25))
        '[2025-01-24 10:30:25] [Assistant: 赤尾]: 我来帮你'
    """
    parts = []

    # 添加时间戳
    if include_timestamp and create_time:
        time_str = create_time.strftime("%Y-%m-%d %H:%M:%S")
        parts.append(f"[{time_str}]")

    # 添加角色和用户名
    if role == "user":
        user_display = username or "未知用户"
        parts.append(f"[User: {user_display}]")
    else:
        parts.append("[Assistant: 赤尾]")

    parts.append(f"[消息{index}]")

    # 添加回复标记
    if reply_index is not None:
        parts.append(f"[↪️回复消息{reply_index}]")

    # 添加消息内容
    formatted = " ".join(parts) + f": {content}"

    return formatted


def format_messages_to_strings(
    messages: list,
    include_timestamp: bool = True,
) -> list[str]:
    """
    批量格式化消息列表为字符串列表

    自动构建消息ID到索引的映射，处理回复关系。

    Args:
        messages: 消息对象列表，每个对象需要有以下属性：
            - message_id: str
            - content: str
            - role: str
            - username: str | None
            - create_time: datetime
            - reply_message_id: str | None
        include_timestamp: 是否包含时间戳

    Returns:
        格式化的消息字符串列表

    Examples:
        >>> messages = [
        ...     QuickSearchResult(message_id="1", content="你好", role="user", ...),
        ...     QuickSearchResult(message_id="2", content="你好啊", role="user", reply_message_id="1", ...),
        ... ]
        >>> format_messages_to_strings(messages)
        ['[2025-01-24 10:30:15] [User: 张三]: 你好',
         '[2025-01-24 10:30:20] [User: 李四] [↪️回复消息1]: 你好啊']
    """
    if not messages:
        return []

    # 构建消息ID到索引的映射（1-based）
    message_id_map = {msg.message_id: idx + 1 for idx, msg in enumerate(messages)}

    formatted_messages = []
    for msg in messages:
        # 确定回复索引
        reply_index = None
        if hasattr(msg, "reply_message_id") and msg.reply_message_id:
            reply_index = message_id_map.get(msg.reply_message_id)

        # 格式化消息
        formatted = format_message_to_str(
            content=msg.content,
            role=msg.role,
            index=message_id_map.get(msg.message_id, 0),
            username=getattr(msg, "username", None),
            create_time=getattr(msg, "create_time", None),
            reply_index=reply_index,
            include_timestamp=include_timestamp,
        )
        formatted_messages.append(formatted)

    return formatted_messages
