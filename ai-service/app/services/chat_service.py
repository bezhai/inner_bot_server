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
    async def generate_ai_reply(request: NewChatRequest) -> str:
        """
        生成 AI 回复内容 - 预留接口
        
        Args:
            request: 聊天请求对象
            
        Returns:
            str: AI 生成的回复内容
        """
        # TODO: 在这里实现具体的 AI 聊天逻辑
        return f"已收到消息：{request.content}"
    
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
                reply_content = await ChatService.generate_ai_reply(request)
                yield ChatProcessResponse(step=Step.SEND, content=reply_content)

                # 5. 回复成功
                yield ChatNormalResponse(step=Step.SUCCESS)
                
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