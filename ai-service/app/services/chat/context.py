import logging
import traceback
from datetime import datetime, timedelta
from typing import List, Dict
from app.types.chat import ChatMessage
from app.orm.crud import get_messages_by_root_id, get_recent_messages_in_chat

logger = logging.getLogger(__name__)


class ContextService:
    """上下文召回服务"""

    @staticmethod
    async def build_conversation_context(
        current_message: ChatMessage, max_context: int = 10
    ) -> List[Dict[str, str]]:
        """
        构建对话上下文，优先回复线程，补充最近消息

        Args:
            current_message: 当前消息对象
            max_context: 最大上下文消息数量

        Returns:
            List[Dict[str, str]]: OpenAI格式的消息列表
        """
        context_messages = []

        try:
            # 将当前消息的时间戳转换为datetime对象
            current_time = datetime.fromtimestamp(
                int(current_message.create_time) / 1000
            )
            # 设置15分钟的时间窗口
            time_window_start = current_time - timedelta(minutes=15)

            # 1. 优先获取回复线程上下文
            logger.info(
                f"获取回复线程上下文: root_message_id={current_message.root_message_id}"
            )
            thread_context = await get_messages_by_root_id(
                current_message.root_message_id,
                exclude_current=current_message.message_id,
                limit=10,
            )
            context_messages.extend(thread_context)

            # 2. 补充最近的消息
            remaining_slots = max_context - len(thread_context)
            if remaining_slots > 0:
                logger.info(f"补充最近消息: remaining_slots={remaining_slots}")
                recent_context = await get_recent_messages_in_chat(
                    chat_id=current_message.chat_id,
                    before_time=current_time,
                    limit=remaining_slots,
                    exclude_current=current_message.message_id,
                    after_time=time_window_start,
                )
                context_messages.extend(recent_context)

            # 3. 去重并按时间排序
            unique_messages = {}
            for msg in context_messages:
                unique_messages[msg.message_id] = msg

            sorted_messages = sorted(
                unique_messages.values(), key=lambda x: int(x.create_time)
            )

            # 4. 转换为 OpenAI 格式
            openai_messages = []
            for msg in sorted_messages:
                role = "assistant" if msg.role == "assistant" else "user"
                content = (
                    f"[{msg.user_name}]: {msg.content}"
                    if role == "user"
                    else msg.content
                )

                openai_messages.append({"role": role, "content": content})

            logger.info(
                f"构建上下文完成: 总消息数={len(openai_messages)}, 时间窗口: {time_window_start} - {current_time}"
            )
            return openai_messages

        except Exception as e:
            logger.error(f"构建对话上下文失败: {str(e)}\n{traceback.format_exc()}")
            return []
