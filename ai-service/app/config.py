from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    dashscope_api_key: str
    openai_api_key: str

    class Config:
        env_file = ".env"
        extra = "ignore"

# 实例化 settings 对象
settings = Settings()