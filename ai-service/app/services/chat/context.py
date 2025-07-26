import logging
from collections.abc import Callable
from typing import Any

from app.clients import memory_client
from app.services.chat.prompt import PromptGeneratorParam
from app.services.meta_info import AsyncRedisClient
from app.types.chat import ChatSimpleMessage

logger = logging.getLogger(__name__)


class MessageContext:
    def __init__(
        self,
        message_id: str,
        system_prompt_generator: Callable[[PromptGeneratorParam], str],
    ):
        self.message_id = message_id
        self.context_messages: list[ChatSimpleMessage] = []
        self.temp_messages: list[Any] = []
        self.system_prompt_generator = system_prompt_generator

    async def init_context_messages(self):
        """
        使用Memory服务构建上下文消息
        """
        try:
            logger.info(f"使用Memory服务构建上下文: message_id={self.message_id}")

            # 获取Redis实例用于检查锁状态
            redis = AsyncRedisClient.get_instance()

            # 调用Memory服务的quick_search接口
            results = await memory_client.quick_search(
                context_message_id=self.message_id,
                max_results=20,
            )

            # 将Memory返回的结果转换为ChatSimpleMessage
            self.context_messages = []

            for result in results:
                result_message_id = result.get("message_id")

                # 检查是否是当前消息
                if result_message_id != self.message_id:
                    # 检查其他消息是否被锁定，如果被锁定则跳过
                    try:
                        lock_key = f"msg_lock:{result_message_id}"
                        is_locked = await redis.exists(lock_key)
                        if is_locked:
                            logger.info(f"跳过被锁定的消息: {result_message_id}")
                            continue
                    except Exception as e:
                        logger.warning(
                            f"检查消息锁状态失败: {result_message_id}, 错误: {str(e)}"
                        )
                        continue

                # 转换为ChatSimpleMessage格式
                simple_message = ChatSimpleMessage(
                    user_name=result.get("user_name", "未知用户"),
                    role=result.get("role", "user"),
                    content=result.get("content", ""),
                )
                self.context_messages.append(simple_message)

            logger.info(
                f"Memory上下文构建完成，包含 {len(self.context_messages)} 条消息"
            )

        except Exception as e:
            logger.error(f"Memory上下文构建失败: {str(e)}")
            # 降级策略：创建一个默认消息

            self.context_messages = [
                ChatSimpleMessage(
                    user_name="未知用户",
                    role="user",
                    content="",
                )
            ]
            logger.info("已降级为默认消息的上下文")

    def append_message(self, message: Any):
        self.temp_messages.append(message)

    def build(self, param: PromptGeneratorParam) -> list[dict[str, Any]]:
        system_prompt = self.system_prompt_generator(param)
        return [
            {"role": "system", "content": system_prompt},
            *list(
                map(
                    lambda x: {
                        "role": x.role,
                        "content": (
                            f"[{x.user_name}]: {x.content}"
                            if x.role == "user"
                            else x.content
                        ),
                    },
                    self.context_messages,
                )
            ),
            *self.temp_messages,
        ]
