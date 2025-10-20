"""OpenAI API client for AI/ML operations."""

from openai import AsyncOpenAI
from openai.types.chat import ChatCompletion
from openai.types.chat.chat_completion_message_param import ChatCompletionMessageParam

from app.agents.basic.model_builder import ModelBuilder


class OpenAIClient:
    """Async OpenAI API client wrapper."""

    def __init__(self, model_id: str) -> None:
        self._client: AsyncOpenAI | None = None
        self.model_id = model_id

    async def connect(self) -> None:
        """Initialize OpenAI client."""
        if self._client is None:
            model_info = await ModelBuilder.get_basic_model_params(self.model_id)
            if model_info is None:
                raise ValueError(f"无法获取模型参数: {self.model_id}")
            self.model_name = model_info["model"]
            self._client = AsyncOpenAI(
                api_key=model_info["api_key"],
                base_url=model_info["base_url"],
                timeout=60.0,
                max_retries=3,
            )

    async def disconnect(self) -> None:
        """Close OpenAI client (cleanup if needed)."""
        if self._client is not None:
            await self._client.close()
            self._client = None

    def _ensure_connected(self) -> AsyncOpenAI:
        """Ensure OpenAI client is connected."""
        if self._client is None:
            raise RuntimeError("OpenAI client not connected. Call connect() first.")
        return self._client

    async def chat_completion(
        self,
        messages: list[ChatCompletionMessageParam],
        **kwargs,
    ) -> ChatCompletion:
        """Create a chat completion."""
        client = self._ensure_connected()
        return await client.chat.completions.create(
            model=self.model_name,
            messages=messages,
            **kwargs,
        )

    async def embed(self, text: str) -> list[float]:
        """直接调用embedding API"""
        client = self._ensure_connected()
        resp = await client.embeddings.create(model=self.model_name, input=text)
        return list(resp.data[0].embedding)

    async def images_generate(
        self,
        prompt: str,
        size: str,
    ) -> list[str]:
        client = self._ensure_connected()
        resp = await client.images.generate(
            model=self.model_name,
            response_format="b64_json",
            prompt=prompt,
            size=size,
            extra_body={
                # "image": images,
                "watermark": False,
                "sequential_image_generation": "disabled",
            },
        )
        return "data:image/jpeg;base64," + resp.data[0].b64_json

    async def __aenter__(self):
        """Async context manager entry."""
        await self.connect()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.disconnect()
