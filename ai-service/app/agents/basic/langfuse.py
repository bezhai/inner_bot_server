from langfuse import Langfuse

from app.config.config import settings


def init_langfuse():
    return Langfuse(
        public_key=settings.langfuse_public_key,
        secret_key=settings.langfuse_secret_key,
        host=settings.langfuse_host,
    )
