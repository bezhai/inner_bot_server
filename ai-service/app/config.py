from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    redis_ip: str
    redis_password: str
    stream_timeout: int = 300  # 流式请求超时时间，默认5分钟（300秒）

    class Config:
        env_file = ".env"
        extra = "ignore"

# 实例化 settings 对象
settings = Settings()
