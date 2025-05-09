from typing import List, Dict, Any, Optional
from qdrant_client import QdrantClient
from qdrant_client.http import models
from qdrant_client.http.models import Distance, VectorParams
from app.config.config import settings
import logging

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