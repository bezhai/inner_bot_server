from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    redis_ip: str
    redis_password: str
    stream_timeout: int = 300  # 流式请求超时时间，默认5分钟（300秒）
    
    # 数据库配置
    postgres_host: str
    postgres_port: int = 5432
    postgres_user: str
    postgres_password: str
    postgres_db: str

    # Qdrant配置
    qdrant_host: str
    qdrant_port: int
    qdrant_api_key: str

    class Config:
        env_file = ".env"
        extra = "ignore"

# 实例化 settings 对象
settings = Settings()
