from typing import List
from openai import AsyncOpenAI
from tenacity import retry, wait_random_exponential, stop_after_attempt

from app.config.openai_config import openai_settings

class OpenAIClient:
    """OpenAI客户端"""
    
    def __init__(self):
        self.client = AsyncOpenAI(
            api_key=openai_settings.openai_api_key,
            base_url=openai_settings.openai_base_url
        )
    
    @retry(wait=wait_random_exponential(min=1, max=20), stop=stop_after_attempt(6))
    async def get_embedding(self, text: str) -> List[float]:
        """获取文本的embedding向量
        
        Args:
            text: 输入文本
            
        Returns:
            embedding向量
        """
        response = await self.client.embeddings.create(
            input=text,
            model=openai_settings.openai_model
        )
        return response.data[0].embedding

# 创建全局客户端实例
openai_client = OpenAIClient() 