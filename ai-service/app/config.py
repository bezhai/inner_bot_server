from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    dashscope_api_key: str  # 这里我们仍然使用 api_key 作为变量名

    class Config:
        env_file = ".env"
        extra = "ignore"

# 实例化 settings 对象
settings = Settings()