import logging
from typing import Dict, Any, Tuple
from app.core.event_decorator import subscribe, EventSubscriber
from app.core.clients.openai import openai_client
from app.services.qdrant import qdrant_service
import uuid
from datetime import datetime
from qdrant_client.http.models import Filter, FieldCondition, Range, MatchValue

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
            
            # 使用当前时间戳作为创建时间
            timestamp = datetime.now().timestamp()
            
            payload = {
                "message_id": message_id,
                "chat_id": chat_id,
                "message_context": message_context,
                "timestamp": timestamp  # 使用浮点数时间戳
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

    @subscribe("find.similar.message")
    async def find_similar_message(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """查找相似消息
        
        Args:
            data: 包含以下字段的字典：
                - messageId: 当前消息ID
                - chatId: 聊天ID
                - message_context: 消息内容
                - similarity_threshold: 相似度阈值（可选，默认0.8）
                
        Returns:
            Dict[str, Any]: 包含以下字段的字典：
                - found: bool, 是否找到相似消息
                - message_id: str, 找到的相似消息ID（如果found为True）
                - similarity: float, 相似度分数（如果found为True）
        """
        try:
            message_id = data.get("messageId")
            chat_id = data.get("chatId")
            message_context = data.get("message_context")
            similarity_threshold = data.get("similarity_threshold", 0.8)
            
            if not all([message_id, chat_id, message_context]):
                logger.error("消息数据不完整")
                return {"found": False}
            
            # 获取当前消息的embedding
            embedding_result = await openai_client.get_embedding(message_context)
            
            # 构建查询过滤器
            # 1. 必须是同一个chat_id
            # 2. 排除当前消息
            query_filter = Filter(
                must=[
                    FieldCondition(
                        key="chat_id",
                        match=MatchValue(value=chat_id)
                    )
                ],
                must_not=[
                    FieldCondition(
                        key="message_id",
                        match=MatchValue(value=message_id)
                    )
                ]
            )
            
            # 搜索相似消息，使用时间戳进行排序权重
            results = await qdrant_service.search_vectors_with_score_boost(
                collection_name="messages",
                query_vector=embedding_result,
                query_filter=query_filter,
                limit=5,  # 获取前5个结果
                score_threshold=similarity_threshold,
                time_boost_factor=0.1  # 时间权重因子
            )
            
            if not results:
                return {"found": False}
            
            # 获取最相似的消息
            best_match = results[0]
            similarity_score = best_match["score"]
            
            if similarity_score >= similarity_threshold:
                return {
                    "found": True,
                    "message_id": best_match["payload"]["message_id"],
                    "similarity": similarity_score
                }
            
            return {"found": False}
            
        except Exception as e:
            logger.error(f"查找相似消息失败: {str(e)}")
            return {"found": False}
            
# 创建消息处理服务实例
message_handler = MessageHandler() 