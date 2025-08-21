"""
话题总结工具

提供话题总结功能，调用memory服务的history_messages接口获取消息列表，然后进行LLM总结
"""

import logging
from datetime import datetime

from app.clients.memory_client import memory_client
from app.tools.decorators import tool
from app.types.memory import HistoryMessagesResponse
from app.utils.middlewares.trace import get_message_id

logger = logging.getLogger(__name__)


@tool(
    name="topic_summary",
    description="获取指定时间范围内的话题总结，帮助用户了解某个时间段内的聊天话题内容",
)
async def topic_summary(
    start_time: str, end_time: str, query: str | None = None
) -> str:
    """
    获取话题总结

    Args:
        start_time: 起始时间，格式为 YYYY-MM-DD HH:MM（如：2024-01-15 14:30）
        end_time: 结束时间，格式为 YYYY-MM-DD HH:MM（如：2024-01-15 18:30）
        query: 查询内容, 非必填, 用于查询特定主题、人物或者关键词的消息

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

        # 调用memory服务获取历史消息列表
        logger.info(
            f"调用历史消息获取: message_id={message_id}, start={start_timestamp}, end={end_timestamp}"
        )

        history_response = await memory_client.history_messages(
            message_id=message_id, start_time=start_timestamp, end_time=end_timestamp
        )

        if not history_response or not history_response.messages:
            return "未找到指定时间范围内的聊天消息"

        # 使用LLM对消息进行总结
        summary = await _summarize_messages_with_llm(history_response, query)
        return summary

    except Exception as e:
        logger.error(f"话题总结工具执行失败: {str(e)}")
        return f"话题总结失败: {str(e)}"


async def _summarize_messages_with_llm(
    history_response: HistoryMessagesResponse, query: str | None = None
) -> str:
    """
    使用 LLM 对消息进行总结
    Args:
        history_response: 历史消息响应对象
        query: 查询内容, 非必填, 用于查询特定主题、人物或者关键词的消息

    Returns:
        str: LLM 总结后的文字
    """
    try:
        # 构造消息内容用于总结
        messages_content = []
        message_index_dict = {
            msg.message_id: index + 1
            for index, msg in enumerate(history_response.messages)
        }
        for index, msg in enumerate(history_response.messages):
            if msg.reply_message_id and msg.reply_message_id in message_index_dict:
                content = f"消息{index + 1} [{msg.user_name}] (回复消息{msg.reply_message_id}): {msg.content}"
            else:
                content = f"消息{index + 1} [{msg.user_name}]: {msg.content}"
            messages_content.append(content)

        # 构造总结提示词
        from app.services.prompt_service import PromptService

        prompt = (
            await PromptService.get_prompt(
                "target_search" if query else "topic_summary"
            )
            or ""
        )

        model_id = "gemini-2.5-flash"

        # 动态导入ModelService以避免循环导入
        from app.services.chat.model import ModelService

        # 获取OpenAI客户端
        client = await ModelService.get_openai_client(model_id)

        content = "# 待分析的聊天记录\n" + "\n".join(messages_content)
        if query:
            content = f"【查询关键词】: {query}\n\n" + content

        # 调用 OpenAI 进行总结
        response = await client.chat.completions.create(
            model=model_id,
            messages=[
                {
                    "role": "system",
                    "content": prompt,
                },
                {
                    "role": "user",
                    "content": content,
                },
            ],
            temperature=0.3,
        )

        summary = response.choices[0].message.content
        logger.info("LLM 聊天总结生成成功")

        return summary or "获取总结失败"

    except Exception as e:
        logger.error(f"LLM 总结失败: {str(e)}")
        # 如果 LLM 总结失败，返回一个简单的消息统计
        return "LLM 总结失败"
