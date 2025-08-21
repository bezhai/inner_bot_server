"""
话题总结工具

提供话题总结功能，调用memory服务的topic_summary接口
"""

import logging
from datetime import datetime

from app.clients.memory_client import memory_client
from app.tools.decorators import tool
from app.utils.middlewares.trace import get_message_id

logger = logging.getLogger(__name__)


@tool(
    name="topic_summary",
    description="获取指定时间范围内的话题总结，帮助用户了解某个时间段内的聊天话题内容",
)
async def topic_summary(start_time: str, end_time: str) -> str:
    """
    获取话题总结

    Args:
        start_time: 起始时间，格式为 YYYY-MM-DD HH:MM（如：2024-01-15 14:30）
        end_time: 结束时间，格式为 YYYY-MM-DD HH:MM（如：2024-01-15 18:30）

    Returns:
        str: 经过LLM总结的话题文字

    Raises:
        ValueError: 当时间格式错误或时间范围不合理时抛出
    """
    try:
        # 获取当前上下文的message_id
        message_id = get_message_id()
        if not message_id:
            return "无法获取当前消息ID，请重试"

        # 解析时间字符串并转换为时间戳
        try:
            start_dt = datetime.strptime(start_time, "%Y-%m-%d %H:%M")
            end_dt = datetime.strptime(end_time, "%Y-%m-%d %H:%M")

            start_timestamp = int(start_dt.timestamp())
            end_timestamp = int(end_dt.timestamp())

        except ValueError as e:
            logger.error(f"时间格式解析错误: {e}")
            return "时间格式错误，请使用 YYYY-MM-DD HH:MM 格式（如：2024-01-15 14:30）"

        # 验证时间范围
        if start_timestamp >= end_timestamp:
            return "起始时间必须早于结束时间"

        # 检查时间差是否超过1天（86400秒）
        time_diff = end_timestamp - start_timestamp
        if time_diff > 86400:
            return "时间范围不能超过1天（24小时）"

        # 调用memory服务获取话题总结
        logger.info(
            f"调用话题总结: message_id={message_id}, start={start_timestamp}, end={end_timestamp}"
        )

        summary = await memory_client.topic_summary(
            message_id=message_id, start_time=start_timestamp, end_time=end_timestamp
        )

        if not summary:
            return "未找到指定时间范围内的话题内容，或话题总结为空"

        return summary

    except Exception as e:
        logger.error(f"话题总结工具执行失败: {str(e)}")
        return f"话题总结失败: {str(e)}"
