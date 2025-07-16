"""
Memory 服务客户端
"""

import logging
import httpx
from typing import List, Dict, Any, Optional
from app.config.memory_service import memory_config

logger = logging.getLogger(__name__)


class MemoryClient:
    """Memory 服务客户端"""

    def __init__(self):
        self.base_url = memory_config.memory_base_url
        self.timeout = memory_config.memory_timeout_seconds

    async def quick_search(
        self,
        chat_id: str,
        user_id: str,
        context_message_id: str,
        query: Optional[str] = None,
        max_results: int = 20
    ) -> List[Dict[str, Any]]:
        """
        快速检索记忆内容

        Args:
            chat_id: 聊天ID
            user_id: 用户ID
            context_message_id: 上下文消息ID
            query: 查询内容（可选）
            max_results: 最大结果数

        Returns:
            List[Dict]: 检索结果列表
        """
        try:
            request_data = {
                "chat_id": chat_id,
                "user_id": user_id,
                "context_message_id": context_message_id,
                "max_results": max_results
            }
            
            if query:
                request_data["query"] = query

            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/api/v1/memory/quick_search",
                    json=request_data
                )
                
                response.raise_for_status()
                data = response.json()
                
                logger.info(f"Memory quick_search成功: {len(data.get('results', []))} 条结果")
                return data.get("results", [])

        except httpx.TimeoutException:
            logger.warning(f"Memory服务超时: {self.timeout}秒")
            return []
        except httpx.HTTPStatusError as e:
            logger.error(f"Memory服务HTTP错误: {e.response.status_code} - {e.response.text}")
            return []
        except Exception as e:
            logger.error(f"Memory服务调用失败: {str(e)}")
            return []

    async def get_message_by_id(
        self,
        chat_id: str,
        user_id: str,
        message_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        根据消息ID获取单条消息

        Args:
            chat_id: 聊天ID
            user_id: 用户ID
            message_id: 消息ID

        Returns:
            Optional[Dict]: 消息内容，如果找不到则返回None
        """
        results = await self.quick_search(
            chat_id=chat_id,
            user_id=user_id,
            context_message_id=message_id,
            max_results=1
        )
        
        # 查找指定message_id的消息
        for result in results:
            if result.get("message_id") == message_id:
                return result
        
        return None


# 全局单例
memory_client = MemoryClient() 