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
    qdrant_service_host: str
    qdrant_service_port: int
    qdrant_service_api_key: str

    search_api_key: str

    bangumi_access_token: str

    class Config:
        env_file = ".env"
        extra = "ignore"


# 实例化 settings 对象
settings = Settings()
