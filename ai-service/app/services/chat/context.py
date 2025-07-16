import logging
from typing import Any, Callable, List, Dict
from app.types.chat import ChatMessage, ChatSimpleMessage
from app.services.chat.prompt import PromptGeneratorParam
from app.core.clients.memory_client import memory_client

logger = logging.getLogger(__name__)


class MessageContext:

    def __init__(
        self,
        message_id: str,
        system_prompt_generator: Callable[[PromptGeneratorParam], str],
    ):
        self.message_id = message_id
        self.message: ChatMessage = None  # 从Memory服务获取
        self.context_messages: List[ChatSimpleMessage] = []
        self.temp_messages: List[Any] = []
        self.system_prompt_generator = system_prompt_generator

    async def init_context_messages(self):
        """
        使用Memory服务构建上下文消息
        """
        try:
            logger.info(f"使用Memory服务构建上下文: message_id={self.message_id}")

            # 由于只有message_id，我们需要先从Memory服务获取消息信息
            # 但是我们没有chat_id和user_id，所以需要修改策略
            # 暂时使用一个简化的方法，直接使用message_id作为context_message_id

            # 调用Memory服务的quick_search接口
            # 这里需要想办法获取chat_id和user_id，或者修改Memory服务支持只用message_id查询
            results = await memory_client.quick_search(
                chat_id="",  # 空值，让Memory服务处理
                user_id="",  # 空值，让Memory服务处理
                context_message_id=self.message_id,
                max_results=20,
            )

            # 将Memory返回的结果转换为ChatSimpleMessage
            self.context_messages = []
            current_message_found = False

            for result in results:
                # 检查是否是当前消息
                if result.get("message_id") == self.message_id:
                    current_message_found = True
                    # 保存当前消息信息
                    self.message = ChatMessage(
                        user_id=result.get("user_id", ""),
                        user_name=result.get("user_name", "未知用户"),
                        content=result.get("content", ""),
                        is_mention_bot=True,
                        role="user",
                        message_id=self.message_id,
                        chat_id=result.get("chat_id", ""),
                        chat_type="group",
                        create_time=result.get("create_time", ""),
                    )

                # 转换为ChatSimpleMessage格式
                simple_message = ChatSimpleMessage(
                    user_name=result.get("user_name", "未知用户"),
                    role="user",  # Memory服务暂时不返回role，默认为user
                    content=result.get("content", ""),
                )
                self.context_messages.append(simple_message)

            # 如果Memory结果中不包含当前消息，需要创建一个默认的
            if not current_message_found:
                self.message = ChatMessage(
                    user_id="unknown",
                    user_name="未知用户",
                    content="",
                    is_mention_bot=True,
                    role="user",
                    message_id=self.message_id,
                    chat_id="unknown",
                    chat_type="group",
                    create_time="",
                )

                current_simple_message = ChatSimpleMessage(
                    user_name="未知用户",
                    role="user",
                    content="",
                )
                self.context_messages.append(current_simple_message)

            logger.info(
                f"Memory上下文构建完成，包含 {len(self.context_messages)} 条消息"
            )

        except Exception as e:
            logger.error(f"Memory上下文构建失败: {str(e)}")
            # 降级策略：创建一个默认消息
            self.message = ChatMessage(
                user_id="unknown",
                user_name="未知用户",
                content="",
                is_mention_bot=True,
                role="user",
                message_id=self.message_id,
                chat_id="unknown",
                chat_type="group",
                create_time="",
            )

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

    def build(self, param: PromptGeneratorParam) -> List[Dict[str, Any]]:
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
