from typing import List, Dict, Any, Optional
from qdrant_client import QdrantClient
from qdrant_client.http import models
from qdrant_client.http.models import Distance, VectorParams
from app.config.config import settings

class QdrantService:
    def __init__(self):
        self.client = QdrantClient(
            host=settings.qdrant_host,
            port=settings.qdrant_port,
            api_key=settings.qdrant_api_key
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
            print(f"创建集合失败: {str(e)}")
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
            print(f"插入向量失败: {str(e)}")
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
            print(f"搜索向量失败: {str(e)}")
            return []
    
    async def delete_collection(self, collection_name: str) -> bool:
        """删除集合"""
        try:
            self.client.delete_collection(collection_name=collection_name)
            return True
        except Exception as e:
            print(f"删除集合失败: {str(e)}")
            return False

# 创建单例实例
qdrant_service = QdrantService() 