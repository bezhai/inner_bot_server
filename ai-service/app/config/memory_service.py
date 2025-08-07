"""
Memory服务配置
"""

from pydantic_settings import BaseSettings


class MemoryServiceConfig(BaseSettings):
    """Memory服务配置类"""

    memory_base_url: str | None = None  # Memory服务基础URL，改为可选，默认 None
    memory_timeout_seconds: int = 3  # 超时时间，默认3秒
    memory_max_results: int = 20  # 最大结果数，默认20条

    class Config:
        env_file = ".env"
        extra = "ignore"


# 全局配置实例
memory_config = MemoryServiceConfig()
