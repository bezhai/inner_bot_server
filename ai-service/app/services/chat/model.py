from app.orm.crud import get_model_and_provider_info
from openai import AsyncOpenAI
from openai.types.chat.chat_completion import Choice
from typing import Dict, List, AsyncGenerator
import asyncio
from contextlib import asynccontextmanager

class ModelService:
    # 类级别缓存，用于存储OpenAI客户端实例
    _client_cache: Dict[str, AsyncOpenAI] = {}
    # 类级别锁，用于保护缓存访问
    _cache_lock = asyncio.Lock()
    # 模型级别锁，用于防止同一模型并发创建多个实例
    _model_locks: Dict[str, asyncio.Lock] = {}
    
    @staticmethod
    async def get_model_info(model_id: str) -> dict:
        model_info = await get_model_and_provider_info(model_id)
        if model_info is None:
            raise Exception("model info not found")
        return model_info
    
    @staticmethod
    @asynccontextmanager
    async def _get_model_lock(model_id: str):
        """获取特定模型的锁"""
        async with ModelService._cache_lock:
            if model_id not in ModelService._model_locks:
                ModelService._model_locks[model_id] = asyncio.Lock()
            lock = ModelService._model_locks[model_id]
        async with lock:
            yield
    
    @staticmethod
    async def get_openai_client(model_id: str) -> AsyncOpenAI:
        """
        通过model_id获取OpenAI客户端实例
        支持缓存以提高复用性，并保证并发安全
        """
        # 先检查缓存中是否已有该model_id的客户端
        async with ModelService._cache_lock:
            if model_id in ModelService._client_cache:
                return ModelService._client_cache[model_id]
        
        # 如果缓存中没有，使用模型特定的锁来创建新实例
        async with ModelService._get_model_lock(model_id):
            # 双重检查，防止在获取锁的过程中其他协程已经创建了实例
            async with ModelService._cache_lock:
                if model_id in ModelService._client_cache:
                    return ModelService._client_cache[model_id]
            
            # 获取模型和供应商信息
            model_info = await ModelService.get_model_info(model_id)
            
            # 创建OpenAI客户端实例
            client = AsyncOpenAI(
                api_key=model_info['api_key'],
                base_url=model_info['base_url']
            )
            
            # 将新创建的客户端加入缓存
            async with ModelService._cache_lock:
                ModelService._client_cache[model_id] = client
            
            return client
    
    @staticmethod
    async def chat_completion_stream(
        model_id: str,
        messages: List[dict],
        temperature: float = 1.0,
        **kwargs
    ) -> AsyncGenerator[Choice, None]:
        """
        发送流式聊天补全请求到OpenAI
        
        Args:
            model_id: 内部模型ID
            messages: 消息列表
            temperature: 温度参数，控制随机性
            **kwargs: 其他OpenAI支持的参数
        
        Returns:
            Choice的异步生成器，每个Choice包含增量的回复内容
        """
        # 获取客户端和模型信息
        client = await ModelService.get_openai_client(model_id)
        model_info = await ModelService.get_model_info(model_id)
        
        # 使用实际的model_name而不是model_id
        model_name = model_info['model_name']
        
        # 构建请求参数
        request_params = {
            'model': model_name,
            'messages': messages,
            'temperature': temperature,
            'stream': True,  # 固定为流式
            **kwargs
        }
        
        async for chunk in await client.chat.completions.create(**request_params):
            if chunk.choices:
                yield chunk.choices[0]
    
    