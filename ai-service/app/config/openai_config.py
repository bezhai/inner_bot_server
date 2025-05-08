from pydantic_settings import BaseSettings

class OpenAISettings(BaseSettings):
    """OpenAI configuration settings."""
    api_key: str
    base_url: str
    model: str = "text-embedding-3-small"

    class Config:
        env_prefix = "OPENAI_"

openai_settings = OpenAISettings() 