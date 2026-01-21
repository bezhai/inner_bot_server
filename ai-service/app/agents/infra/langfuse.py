"""Langfuse 集成"""

from langfuse import Langfuse

from app.config import settings

client = Langfuse(
    public_key=settings.langfuse_public_key,
    secret_key=settings.langfuse_secret_key,
    host=settings.langfuse_host,
)


def get_prompt(prompt_id: str, label: str | None = None):
    return client.get_prompt(prompt_id, label=label)
