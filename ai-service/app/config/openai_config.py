from pydantic_settings import BaseSettings


class OpenAISettings(BaseSettings):
    """OpenAI configuration settings."""

    openai_api_key: str | None = None
    openai_base_url: str | None = None
    openai_model: str = "text-embedding-3-small"

    class Config:
        env_file = ".env"
        extra = "ignore"


openai_settings = OpenAISettings()
