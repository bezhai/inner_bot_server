from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    redis_ip: str
    redis_password: str

    class Config:
        env_file = ".env"
        extra = "ignore"

# 实例化 settings 对象
settings = Settings()