"""OpenAI API client for AI/ML operations."""

from abc import ABC, abstractmethod
from typing import Generic, TypeVar

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
ClientT = TypeVar("ClientT")


class Modality:
    """模态常量"""

    TEXT = "text"
    IMAGE = "image"
    VIDEO = "video"
    TEXT_AND_IMAGE = "text and image"
    TEXT_AND_VIDEO = "text and video"
    IMAGE_AND_VIDEO = "image and video"


class InstructionBuilder:
    """Embedding instructions 构建器

    根据 doubao-embedding-vision 模型文档，instructions 字段的配置规则：

    1. 召回/排序类任务（区分 Query/Corpus）：
       - Query 侧: Target_modality: {}.\nInstruction:{}\nQuery:
       - Corpus 侧: Instruction:Compress the {} into one word.\nQuery:

    2. 聚类/分类/STS 类任务（不区分）：
       - 所有数据: Target_modality: {}.\nInstruction:{}\nQuery:
    """

    @staticmethod
    def detect_input_modality(
        text: str | None,
        images: list[str] | None,
    ) -> str:
        """
        检测单条输入的模态（用于 Corpus 侧 / 聚类场景）

        根据输入内容自动判断：
        - 有文本有图片 -> "text and image"
        - 只有文本 -> "text"
        - 只有图片 -> "image"

        Args:
            text: 文本内容
            images: 图片列表

        Returns:
            模态字符串
        """
        has_text = bool(text and text.strip())
        has_image = bool(images)

        if has_text and has_image:
            return Modality.TEXT_AND_IMAGE
        elif has_text:
            return Modality.TEXT
        elif has_image:
            return Modality.IMAGE
        return Modality.TEXT  # fallback

    @staticmethod
    def combine_corpus_modalities(*modalities: str) -> str:
        """
        组合 Corpus 库包含的多种模态类型（用于 Query 侧 Target_modality）

        用 `/` 分隔表示库中存在这些独立类型的样本

        Args:
            modalities: 模态类型列表

        Returns:
            组合后的模态字符串

        Examples:
            combine_corpus_modalities("text", "image")
                -> "text/image"
            combine_corpus_modalities("text", "image", "text and image")
                -> "text/image/text and image"
        """
        return "/".join(modalities)

    @staticmethod
    def for_corpus(modality: str) -> str:
        """
        Corpus 侧 instructions（召回/排序任务）

        Args:
            modality: 当前单条数据的模态

        Returns:
            instructions 字符串
        """
        return f"Instruction:Compress the {modality} into one word.\nQuery:"

    @staticmethod
    def for_query(target_modality: str, instruction: str) -> str:
        """
        Query 侧 instructions（召回/排序任务）

        Args:
            target_modality: Corpus 库的模态类型（用 / 分隔多种类型）
            instruction: 检索意图描述

        Returns:
            instructions 字符串
        """
        return f"Target_modality: {target_modality}.\nInstruction:{instruction}\nQuery:"

    @staticmethod
    def for_cluster(target_modality: str, instruction: str) -> str:
        """
        聚类/分类/STS 类 instructions

        Args:
            target_modality: 数据集的统一模态类型
            instruction: 任务描述

        Returns:
            instructions 字符串
        """
        return f"Target_modality: {target_modality}.\nInstruction:{instruction}\nQuery:"


class BaseAIClient(ABC, Generic[ClientT]):
    """AI客户端抽象基类，提供通用的生命周期管理。"""

    def __init__(self, model_id: str) -> None:
        self._client: ClientT | None = None
        self.model_id = model_id
        self.model_name: str = ""

    @abstractmethod
    async def _create_client(self, model_info: dict) -> ClientT:
        """创建具体的客户端实例。

        Args:
            model_info: 包含 api_key, base_url, model 等信息的字典

        Returns:
            具体的客户端实例
        """
        ...

    async def connect(self) -> None:
        """初始化客户端连接。"""
        if self._client is None:
            model_info = await ModelBuilder.get_basic_model_params(self.model_id)
            if model_info is None:
                raise ValueError(f"无法获取模型参数: {self.model_id}")
            self.model_name = model_info["model"]
            self._client = await self._create_client(model_info)

    async def disconnect(self) -> None:
        """关闭客户端连接。"""
        if self._client is not None:
            await self._client.close()  # type: ignore[union-attr]
            self._client = None

    def _ensure_connected(self) -> ClientT:
        """确保客户端已连接。

        Returns:
            已连接的客户端实例

        Raises:
            RuntimeError: 如果客户端未连接
        """
        if self._client is None:
            raise RuntimeError(
                f"{self.__class__.__name__} not connected. Call connect() first."
            )
        return self._client

    async def __aenter__(self):
        """异步上下文管理器入口。"""
        await self.connect()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """异步上下文管理器出口。"""
        await self.disconnect()


class OpenAIClient(BaseAIClient[AsyncOpenAI]):
    """Async OpenAI API client wrapper."""

    async def _create_client(self, model_info: dict) -> AsyncOpenAI:
        """创建 AsyncOpenAI 客户端实例。"""
        return AsyncOpenAI(
            api_key=model_info["api_key"],
            base_url=model_info["base_url"],
            timeout=60.0,
            max_retries=3,
        )

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


class ArkClient(BaseAIClient[AsyncArk]):
    """Ark客户端"""

    async def _create_client(self, model_info: dict) -> AsyncArk:
        """创建 AsyncArk 客户端实例。"""
        return AsyncArk(
            api_key=model_info["api_key"],
            base_url=model_info["base_url"],
            timeout=60.0,
            max_retries=3,
        )

    async def embed_multimodal(
        self,
        text: str,
        image_base64_list: list[str],
        instructions: str,
        dimensions: int = 1024,
    ) -> list[float]:
        """
        多模态向量化

        Args:
            text: 文本内容
            image_base64_list: Base64格式图片列表
            instructions: 向量化指令（使用 InstructionBuilder 构建）
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
