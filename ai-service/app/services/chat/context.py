import logging
from typing import Any, Callable, List, Dict
from app.types.chat import ChatMessage, ChatSimpleMessage
from app.services.chat.prompt import PromptGeneratorParam

logger = logging.getLogger(__name__)


class MessageContext:
    def __init__(
        self,
        message: ChatMessage,
        system_prompt_generator: Callable[[PromptGeneratorParam], str],
    ):
        self.message = message
        self.context_messages: List[ChatSimpleMessage] = []
        self.temp_messages: List[Any] = []
        self.system_prompt_generator = system_prompt_generator

        # 智能记忆管理服务
        self._enhanced_context_service = None

    async def init_context_messages(self):
        """
        使用智能记忆管理初始化上下文消息
        """
        try:
            logger.info("使用智能记忆管理构建上下文")

            # 延迟导入和初始化
            if self._enhanced_context_service is None:
                from app.services.chat.memory.context_builder import (
                    EnhancedContextService,
                )

                self._enhanced_context_service = EnhancedContextService()

            # 使用智能记忆管理构建上下文
            self.context_messages = (
                await self._enhanced_context_service.build_intelligent_context(
                    current_message=self.message, max_context=20
                )
            )

            # 添加当前消息到上下文
            self.context_messages.append(
                ChatSimpleMessage(
                    user_name=self.message.user_name,
                    role=self.message.role,
                    content=self.message.content,
                )
            )

            logger.info(f"智能上下文构建完成，包含 {len(self.context_messages)} 条消息")

        except Exception as e:
            logger.error(f"智能上下文构建失败: {str(e)}")
            # 最简降级策略：仅当前消息
            self.context_messages = [
                ChatSimpleMessage(
                    user_name=self.message.user_name,
                    role=self.message.role,
                    content=self.message.content,
                )
            ]

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
