"""
Memory 服务客户端
"""

import logging
from typing import Any

import httpx

from app.config.memory_service import memory_config
from app.types.memory import HistoryMessagesResponse

logger = logging.getLogger(__name__)


class MemoryClient:
    """Memory 服务客户端"""

    def __init__(self):
        self.base_url = memory_config.memory_base_url
        self.timeout = memory_config.memory_timeout_seconds

    async def quick_search(
        self, context_message_id: str, query: str | None = None, max_results: int = 20
    ) -> list[dict[str, Any]]:
        """
        快速检索记忆内容

        Args:
            context_message_id: 上下文消息ID
            query: 查询内容（可选）
            max_results: 最大结果数

        Returns:
            List[Dict]: 检索结果列表
        """
        try:
            request_data = {
                "context_message_id": context_message_id,
                "max_results": max_results,
            }

            if query:
                request_data["query"] = query

            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/api/v1/memory/quick_search", json=request_data
                )

                response.raise_for_status()
                data = response.json()

                logger.info(
                    f"Memory quick_search成功: {len(data.get('results', []))} 条结果"
                )
                return data.get("results", [])

        except httpx.TimeoutException:
            logger.warning(f"Memory服务超时: {self.timeout}秒")
            return []
        except httpx.HTTPStatusError as e:
            logger.error(
                f"Memory服务HTTP错误: {e.response.status_code} - {e.response.text}"
            )
            return []
        except Exception as e:
            logger.error(f"Memory服务调用失败: {str(e)}")
            return []

    async def history_messages(
        self, message_id: str, start_time: int, end_time: int
    ) -> HistoryMessagesResponse | None:
        """
        获取历史消息列表

        Args:
            message_id: 消息ID
            start_time: 起始时间（秒时间戳）
            end_time: 结束时间（秒时间戳）

        Returns:
            HistoryMessagesResponse: 历史消息列表，如果失败返回None
        """
        try:
            request_data = {
                "message_id": message_id,
                "start_time": start_time,
                "end_time": end_time,
            }

            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/api/v1/memory/history_messages", json=request_data
                )

                response.raise_for_status()
                data = response.json()

                logger.info(
                    f"Memory history_messages成功，获取到 {data.get('total_count', 0)} 条消息"
                )
                return HistoryMessagesResponse(**data)

        except httpx.TimeoutException:
            logger.warning(f"Memory服务超时: {self.timeout}秒")
            return None
        except httpx.HTTPStatusError as e:
            logger.error(
                f"Memory服务HTTP错误: {e.response.status_code} - {e.response.text}"
            )
            return None
        except Exception as e:
            logger.error(f"Memory服务调用失败: {str(e)}")
            return None


# 全局单例
memory_client = MemoryClient()
