import json
from typing import Dict, List
from redis.asyncio import Redis, ConnectionPool
from app.config import settings

class AsyncRedisClient:
    """
    异步 Redis 客户端单例封装
    """
    _instance = None

    @staticmethod
    def get_instance():
        """
        获取单例 Redis 客户端实例
        """
        if AsyncRedisClient._instance is None:
            pool = ConnectionPool(
                host=settings.redis_ip,
                port='6379',
                password=settings.redis_password,
                decode_responses=True,
                max_connections=10
            )
            AsyncRedisClient._instance = Redis(connection_pool=pool)
        return AsyncRedisClient._instance
    

async def get_model_setting(model_name: str) -> Dict:
    client = AsyncRedisClient.get_instance()
    str_settings = await client.get('model_setting')
    settings = json.loads(str_settings)
    
    # 遍历配置列表，查找包含目标模型的配置
    for setting in settings:
        if model_name in setting["model_index"]:  # 检查 model_index 是否包含模型名称
            return {
                "api_key": setting["api_key"],
                "base_url": setting["base_url"],
                "model": setting["model_index"][model_name]
            }

    return None

async def get_model_list() -> List[str]:
    client = AsyncRedisClient.get_instance()
    str_settings = await client.get('model_setting')
    settings = json.loads(str_settings)
    
    # 遍历配置列表，查找包含目标模型的配置
    model_list = []
    for setting in settings:
        model_list.extend(setting["model_index"].keys())
    return model_list