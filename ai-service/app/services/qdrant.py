from typing import List, Dict, Any, Optional
from qdrant_client import QdrantClient
from qdrant_client.http import models
from qdrant_client.http.models import Distance, VectorParams, Filter
from app.config.config import settings
import logging
import numpy as np
from datetime import datetime

logger = logging.getLogger(__name__)

class QdrantService:
    def __init__(self):
        self.client = QdrantClient(
            host=settings.qdrant_service_host,
            port=settings.qdrant_service_port,
            api_key=settings.qdrant_service_api_key,
            prefer_grpc=False,
            https=False
        )
    
    async def create_collection(self, collection_name: str, vector_size: int) -> bool:
        """创建新的集合"""
        try:
            self.client.create_collection(
                collection_name=collection_name,
                vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE)
            )
            return True
        except Exception as e:
            logger.warning(f"创建集合失败: {str(e)}")
            return False
    
    async def upsert_vectors(
        self,
        collection_name: str,
        vectors: List[List[float]],
        ids: List[str],
        payloads: Optional[List[Dict[str, Any]]] = None
    ) -> bool:
        """插入或更新向量"""
        try:
            self.client.upsert(
                collection_name=collection_name,
                points=models.Batch(
                    ids=ids,
                    vectors=vectors,
                    payloads=payloads or [{}] * len(vectors)
                )
            )
            return True
        except Exception as e:
            logger.error(f"插入向量失败: {str(e)}")
            return False
    
    async def search_vectors(
        self,
        collection_name: str,
        query_vector: List[float],
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """搜索最相似的向量"""
        try:
            results = self.client.search(
                collection_name=collection_name,
                query_vector=query_vector,
                limit=limit
            )
            return [
                {
                    "id": hit.id,
                    "score": hit.score,
                    "payload": hit.payload
                }
                for hit in results
            ]
        except Exception as e:
            logger.error(f"搜索向量失败: {str(e)}")
            return []
            
    async def search_vectors_with_score_boost(
        self,
        collection_name: str,
        query_vector: List[float],
        query_filter: Optional[Filter] = None,
        limit: int = 10,
        score_threshold: float = 0.8,
        time_boost_factor: float = 0.1
    ) -> List[Dict[str, Any]]:
        """搜索向量并应用时间权重提升
        
        Args:
            collection_name: 集合名称
            query_vector: 查询向量
            query_filter: 查询过滤器
            limit: 返回结果数量限制
            score_threshold: 相似度阈值
            time_boost_factor: 时间权重因子，值越大时间权重影响越大
            
        Returns:
            List[Dict[str, Any]]: 搜索结果列表，每个结果包含id、score和payload
        """
        try:
            # 获取原始搜索结果
            results = self.client.search(
                collection_name=collection_name,
                query_vector=query_vector,
                query_filter=query_filter,
                limit=limit * 2  # 获取更多结果以便后续重排序
            )
                        
            if not results:
                return []
                
            current_time = datetime.now().timestamp()
            
            # 对每个结果应用时间权重
            weighted_results = []
            for hit in results:
                # 获取原始相似度分数
                original_score = hit.score
                
                # 如果原始分数低于阈值，跳过
                if original_score < score_threshold:
                    logger.info(f"原始相似度分数低于阈值，跳过: {original_score}")
                    continue
                
                # 获取消息时间戳，确保是浮点数类型
                msg_timestamp = hit.payload.get("timestamp", current_time)
                if isinstance(msg_timestamp, str):
                    try:
                        msg_timestamp = float(msg_timestamp)
                    except (ValueError, TypeError):
                        logger.warning(f"无效的时间戳格式: {msg_timestamp}，使用当前时间")
                        msg_timestamp = current_time
                
                # 计算时间差（小时）
                time_diff_hours = (current_time - msg_timestamp) / 3600
                
                # 计算时间权重（越早的消息权重越高）
                # 使用指数衰减函数：exp(-time_diff_hours * time_boost_factor)
                time_weight = np.exp(-time_diff_hours * time_boost_factor)
                
                # 计算最终分数（结合原始相似度和时间权重）
                final_score = original_score * (1 + time_weight * time_boost_factor)
                
                logger.info(f"消息时间戳: {msg_timestamp}, 时间差(小时): {time_diff_hours}, 时间权重: {time_weight}, 最终分数: {final_score}")
                
                weighted_results.append({
                    "id": hit.id,
                    "score": final_score,
                    "payload": hit.payload,
                    "original_score": original_score,
                    "time_weight": time_weight
                })
            
            # 按最终分数排序
            weighted_results.sort(key=lambda x: x["score"], reverse=True)
            
            # 返回前limit个结果
            return weighted_results[:limit]
            
        except Exception as e:
            logger.error(f"带权重搜索向量失败: {str(e)}")
            return []
    
    async def delete_collection(self, collection_name: str) -> bool:
        """删除集合"""
        try:
            self.client.delete_collection(collection_name=collection_name)
            return True
        except Exception as e:
            logger.error(f"删除集合失败: {str(e)}")
            return False

# 创建单例实例
qdrant_service = QdrantService()

async def init_qdrant_collections():
    """初始化所有必要的QDrant集合"""
    try:
        # 创建消息集合，向量维度为1536（OpenAI text-embedding-3-small模型的输出维度）
        result = await qdrant_service.create_collection(
            collection_name="messages",
            vector_size=1536
        )
        if result:
            logger.info("QDrant消息集合创建成功")
        else:
            logger.warning("QDrant消息集合可能已存在")
    except Exception as e:
        logger.error(f"初始化QDrant集合失败: {str(e)}") 