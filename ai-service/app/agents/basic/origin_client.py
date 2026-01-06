"""OpenAI API client for AI/ML operations."""

from typing import TypeVar

from openai import AsyncOpenAI
from openai.types.chat import ChatCompletion
from openai.types.chat.chat_completion_message_param import ChatCompletionMessageParam
from pydantic import BaseModel
from volcenginesdkarkruntime import AsyncArk
from volcenginesdkarkruntime.types.multimodal_embedding import (
    EmbeddingInputParam,
)

from app.agents.basic.model_builder import ModelBuilder

T = TypeVar("T", bound=BaseModel)


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
        reference_urls: list[str] | None = None,
    ) -> list[str]:
        client = self._ensure_connected()
        extra_body = {
            "watermark": False,
            "sequential_image_generation": "disabled",
        }

        # 如果提供了参考图片，添加到 extra_body
        if reference_urls:
            extra_body["image"] = reference_urls

        resp = await client.images.generate(
            model=self.model_name,
            response_format="b64_json",
            prompt=prompt,
            size=size,  # pyright: ignore[reportArgumentType]
            extra_body=extra_body,
        )
        return [f"data:image/jpeg;base64,{image.b64_json}" for image in resp.data or []]

    async def __aenter__(self):
        """Async context manager entry."""
        await self.connect()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.disconnect()


class ArkClient:
    """Ark客户端"""

    def __init__(self, model_id: str) -> None:
        self._client: AsyncArk | None = None
        self.model_id = model_id

    async def connect(self) -> None:
        """Initialize OpenAI client."""
        if self._client is None:
            model_info = await ModelBuilder.get_basic_model_params(self.model_id)
            if model_info is None:
                raise ValueError(f"无法获取模型参数: {self.model_id}")
            self.model_name = model_info["model"]
            self._client = AsyncArk(
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

    def _ensure_connected(self) -> AsyncArk:
        """Ensure Ark client is connected."""
        if self._client is None:
            raise RuntimeError("Ark client not connected. Call connect() first.")
        return self._client

    async def embed_multimodal(
        self,
        text: str,
        image_base64_list: list[str],
        instructions: str,
        dimensions: int = 1024,
    ) -> list[float]:
        """
        多模态向量化（通用方法）

        Args:
            text: 文本内容
            image_base64_list: Base64格式图片列表
            instructions: 向量化指令（召回或聚类场景）
            dimensions: 向量维度，默认1024

        Returns:
            list[float]: 向量表示
        """
        client = self._ensure_connected()

        # 构造输入列表
        input_list: list[EmbeddingInputParam] = []

        # 添加文本
        if text:
            input_list.append({"type": "text", "text": text})

        # 添加图片
        for image_base64 in image_base64_list:
            input_list.append({"type": "image_url", "image_url": {"url": image_base64}})

        # 调用API
        resp = await client.multimodal_embeddings.create(
            model=self.model_name,
            input=input_list,
            dimensions=dimensions,
            encoding_format="float",
            extra_body={"instructions": instructions},
        )

        return resp.data.embedding

    async def embed_multimodal_for_recall(
        self, text: str, image_base64_list: list[str]
    ) -> list[float]:
        """
        生成召回向量（用于检索匹配）

        Args:
            text: 文本内容
            image_base64_list: Base64格式图片列表

        Returns:
            list[float]: 召回向量（1024维）
        """
        instructions = "Instruction:Compress the text and image into one word.\\nQuery:"
        return await self.embed_multimodal(text, image_base64_list, instructions)

    async def embed_multimodal_for_cluster(
        self, text: str, image_base64_list: list[str]
    ) -> list[float]:
        """
        生成聚类向量（用于相似度聚类）

        Args:
            text: 文本内容
            image_base64_list: Base64格式图片列表

        Returns:
            list[float]: 聚类向量（1024维）
        """
        instructions = "Target_modality: text and image.\\nInstruction:Retrieve semantically similar content\\nQuery:"
        return await self.embed_multimodal(text, image_base64_list, instructions)

    async def embed_multimodal_for_query(
        self, text: str, image_base64_list: list[str]
    ) -> list[float]:
        """
        生成查询向量（Query侧，用于检索消息）

        用于召回场景的Query侧，能够检索与查询语义相关的Corpus（消息库）。

        Args:
            text: 查询文本
            image_base64_list: 查询图片列表（可选）

        Returns:
            list[float]: 查询向量（1024维）
        """
        # Target_modality设置为 text/image，匹配消息库的模态
        # Instruction描述检索意图
        instructions = "Target_modality: text/image.\\nInstruction:为这个句子生成表示以用于检索相关消息\\nQuery:"
        return await self.embed_multimodal(text, image_base64_list, instructions)

    async def __aenter__(self):
        """Async context manager entry."""
        await self.connect()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.disconnect()
