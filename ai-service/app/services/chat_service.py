"""
聊天服务层
处理聊天相关的业务逻辑
"""
import asyncio
import logging
import traceback
from datetime import datetime
from typing import AsyncGenerator

from app.types.chat import NewChatRequest, Step, ChatProcessResponse, ChatNormalResponse
from app.orm.crud import create_formated_message
from app.utils.decorators import auto_json_serialize
from app.services.chat.chat_service import ChatService as AIChatService

logger = logging.getLogger(__name__)


class ChatService:
    """聊天服务类"""
    
    @staticmethod
    async def save_message_to_db(request: NewChatRequest) -> None:
        """
        将聊天消息保存到数据库
        
        Args:
            request: 聊天请求对象
            
        Raises:
            Exception: 数据库写入失败时抛出异常
        """
        try:
            data = request.model_dump()
            # 将毫秒时间戳转换为datetime对象
            data["create_time"] = datetime.fromtimestamp(int(data["create_time"]) / 1000)
            await create_formated_message(data)
            logger.info(f"消息已保存到数据库: message_id={request.message_id}")
        except Exception as e:
            logger.error(f"写入数据库失败: {str(e)}\n{traceback.format_exc()}")
            raise
    
    @staticmethod
    async def generate_ai_reply(request: NewChatRequest) -> AsyncGenerator[str, None]:
        """
        生成 AI 回复内容
        
        Args:
            request: 聊天请求对象
            
        Yields:
            str: AI 生成的回复内容片段
        """
        async for chunk in AIChatService.generate_ai_reply(
            user_input=request.content
        ):
            yield chunk
    
    @staticmethod
    @auto_json_serialize
    async def process_chat_sse(request: NewChatRequest) -> AsyncGenerator[ChatNormalResponse | ChatProcessResponse, None]:
        """
        处理 SSE 聊天流程
        
        Args:
            request: 聊天请求对象
            
        Yields:
            ChatNormalResponse | ChatProcessResponse: 聊天响应对象
        """
        try:
            # 1. 接收消息确认
            yield ChatNormalResponse(step=Step.ACCEPT)

            # 2. 保存消息到数据库
            await ChatService.save_message_to_db(request)

            # 3. 开始生成回复
            yield ChatNormalResponse(step=Step.START_REPLY)

            # 4. 生成并发送回复
            try:
                complete_content = ""  # 用于累积完整内容
                async for chunk in ChatService.generate_ai_reply(request):
                    complete_content += chunk  # 累积内容
                    yield ChatProcessResponse(step=Step.SEND, content=complete_content)

                # 5. 回复成功，返回完整内容
                yield ChatProcessResponse(step=Step.SUCCESS, content=complete_content)
                
            except Exception as e:
                logger.error(f"生成回复失败: {str(e)}")
                yield ChatNormalResponse(step=Step.FAILED)
                return

            # 6. 流程结束
            yield ChatNormalResponse(step=Step.END)

        except Exception as e:
            logger.error(f"SSE 聊天处理失败: {str(e)}\n{traceback.format_exc()}")
            yield ChatNormalResponse(step=Step.FAILED)


# 创建服务实例
chat_service = ChatService() 