import logging
from typing import Dict, Any
from app.core.event_decorator import subscribe, EventSubscriber
from app.core.clients.openai import openai_client
from app.services.qdrant import qdrant_service
import uuid
logger = logging.getLogger(__name__)

class MessageHandler(EventSubscriber):
    """消息处理服务"""
    
    def __init__(self):
        super().__init__()  # 必须调用父类初始化，触发事件注册
        
    @subscribe("message.receive")
    async def handle_message_receive(self, data: Dict[str, Any]) -> None:
        """处理消息接收事件"""
        try:
            message_id = data.get("messageId")
            chat_id = data.get("chatId")
            message_context = data.get("message_context")
            
            if not all([message_id, chat_id, message_context]):
                logger.error("消息数据不完整")
                return
            
            embedding_result = await openai_client.get_embedding(message_context)
            
            # 将消息内容和embedding写入QDrant
            # 使用UUID v5，这样相同的message_id总是生成相同的UUID
            vector_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, message_id))
            
            payload = {
                "message_id": message_id,
                "chat_id": chat_id,
                "message_context": message_context,
                "timestamp": data.get("timestamp", "")
            }
            
            await qdrant_service.upsert_vectors(
                collection_name="messages",
                vectors=[embedding_result],
                ids=[vector_id],
                payloads=[payload]
            )
            
            logger.info(f"消息已写入QDrant: messageId={message_id}, vectorId={vector_id}, chatId={chat_id}, context={message_context}, embedding_result[0]={embedding_result[0]}")
            
        except Exception as e:
            logger.error(f"处理消息接收事件失败: {str(e)}")
            
# 创建消息处理服务实例
message_handler = MessageHandler() 