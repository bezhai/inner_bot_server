import json
from typing import Dict, List
import asyncpg
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


class AsyncDBClient:
    """
    异步数据库客户端单例封装
    """
    _instance = None
    _pool = None

    @staticmethod
    async def get_instance():
        """
        获取单例数据库客户端实例
        """
        if AsyncDBClient._pool is None:
            # 创建连接池
            AsyncDBClient._pool = await asyncpg.create_pool(
                host=settings.postgres_host,
                port=settings.postgres_port,
                user=settings.postgres_user,
                password=settings.postgres_password,
                database=settings.postgres_db
            )
        return AsyncDBClient._pool


async def get_model_setting(model_name: str) -> Dict:
    """
    从数据库获取模型设置
    """
    pool = await AsyncDBClient.get_instance()
    
    async with pool.acquire() as conn:
        # 查询模型和对应的供应商信息
        query = """
        SELECT m.model_id, m.model_name, p.api_key, p.base_url
        FROM ai_model m
        JOIN model_provider p ON m.provider_id = p.provider_id
        WHERE m.model_id = $1 AND m.is_active = true AND p.is_active = true
        """
        
        row = await conn.fetchrow(query, model_name)
        
        if row:
            return {
                "api_key": row['api_key'],
                "base_url": row['base_url'],
                "model": row['model_name']  # 使用model_name字段作为实际调用的模型名称
            }
    
    # 如果数据库中没有找到，尝试从Redis中获取（兼容旧版本）
    try:
        client = AsyncRedisClient.get_instance()
        str_settings = await client.get('model_setting')
        if str_settings:
            redis_settings = json.loads(str_settings)
            
            # 遍历配置列表，查找包含目标模型的配置
            for setting in redis_settings:
                if model_name in setting["model_index"]:  # 检查 model_index 是否包含模型名称
                    return {
                        "api_key": setting["api_key"],
                        "base_url": setting["base_url"],
                        "model": setting["model_index"][model_name]
                    }
    except Exception as e:
        print(f"从Redis获取模型设置失败: {e}")
    
    return None


async def get_model_list() -> List[str]:
    """
    从数据库获取模型列表
    """
    pool = await AsyncDBClient.get_instance()
    
    async with pool.acquire() as conn:
        query = """
        SELECT m.model_id
        FROM ai_model m
        JOIN model_provider p ON m.provider_id = p.provider_id
        WHERE m.is_active = true AND p.is_active = true
        """
        
        rows = await conn.fetch(query)
        model_list = [row['model_id'] for row in rows]
        
        if model_list:
            return model_list
    
    # 如果数据库中没有找到，尝试从Redis中获取（兼容旧版本）
    try:
        client = AsyncRedisClient.get_instance()
        str_settings = await client.get('model_setting')
        if str_settings:
            redis_settings = json.loads(str_settings)
            
            # 遍历配置列表，查找包含目标模型的配置
            redis_model_list = []
            for setting in redis_settings:
                redis_model_list.extend(setting["model_index"].keys())
            return redis_model_list
    except Exception as e:
        print(f"从Redis获取模型列表失败: {e}")
    
    return []
