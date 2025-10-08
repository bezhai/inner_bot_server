from __future__ import annotations

import logging
from typing import List

from openai import AsyncOpenAI

from app.orm.crud import get_model_and_provider_info

logger = logging.getLogger(__name__)


class EmbeddingClient:
    def __init__(self, model_id: str = "302.ai:text-embedding-3-small") -> None:
        self.model_id = model_id
        self._client: AsyncOpenAI | None = None
        self._model_name: str | None = None

    async def connect(self) -> None:
        if self._client is None:
            config = await get_model_and_provider_info(self.model_id)
            if not config:
                raise ValueError(f"Embedding provider not configured: {self.model_id}")
            self._model_name = config["model_name"]
            self._client = AsyncOpenAI(api_key=config["api_key"], base_url=config["base_url"])

    async def disconnect(self) -> None:
        if self._client is not None:
            await self._client.close()
            self._client = None

    def _ensure(self) -> AsyncOpenAI:
        if self._client is None or self._model_name is None:
            raise RuntimeError("EmbeddingClient not connected. Call connect() first.")
        return self._client

    async def embed(self, text: str) -> List[float]:
        client = self._ensure()
        assert self._model_name is not None
        resp = await client.embeddings.create(model=self._model_name, input=text)
        return list(resp.data[0].embedding)

    async def __aenter__(self):
        await self.connect()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.disconnect()

