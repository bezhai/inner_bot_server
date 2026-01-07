"""统一的底层模型客户端封装（OpenAI / Ark / HTTP Image 等）。"""

import asyncio
from abc import ABC, abstractmethod
from typing import Any, Generic, TypeVar

import requests
from openai import AsyncOpenAI
from pydantic import BaseModel
from volcenginesdkarkruntime import AsyncArk
from volcenginesdkarkruntime.types.multimodal_embedding import (
    EmbeddingInputParam,
)

from app.agents.basic.model_builder import ModelBuilder

T = TypeVar("T", bound=BaseModel)
ClientT = TypeVar("ClientT")


class ClientType:
    """底层客户端类型枚举。

    主要通过 model_provider.client_type 进行配置：
    - "openai": OpenAI 兼容客户端
    - "ark": 火山引擎 Ark Runtime 客户端
    - "azure-http": 仅支持生图的 HTTP 客户端
    """

    OPENAI = "openai"
    ARK = "ark"
    AZURE_HTTP = "azure-http"


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
        self.client_type: str | None = None

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
            self.client_type = model_info.get("client_type")
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

    # 工厂方法：根据 model_provider.client_type 选择具体实现
    @staticmethod
    async def create(model_id: str) -> "BaseAIClient[Any]":
        """根据模型配置创建合适的客户端实例。

        Args:
            model_id: 内部模型 ID（alias 或 provider:model 形式）

        Returns:
            对应的 BaseAIClient 子类实例（如 OpenAIClient、ArkClient）
        """

        model_info = await ModelBuilder._get_model_and_provider_info(model_id)
        if model_info is None or not model_info.get("is_active", True):
            raise ValueError(f"无法获取模型配置或模型未激活: {model_id}")

        client_type = (model_info.get("client_type") or ClientType.OPENAI).lower()

        if client_type == ClientType.OPENAI:
            return OpenAIClient(model_id)
        if client_type == ClientType.ARK:
            return ArkClient(model_id)
        if client_type == ClientType.AZURE_HTTP:
            return AzureHttpClient(model_id)

        raise ValueError(f"未知的 client_type: {client_type} (model_id={model_id})")

    async def embed(
        self,
        text: str | None = None,
        image_base64_list: list[str] | None = None,
        instructions: str | None = None,
        dimensions: int | None = None,
    ) -> list[float]:
        """统一的 embedding 能力（默认不支持）。

        Args:
            text: 文本内容，可选
            image_base64_list: Base64 图片列表，可选
            instructions: 任务指令（如召回/聚类/STS 等），可选
            dimensions: 维度，具体是否生效由底层模型决定
        """
        raise RuntimeError(f"{self.__class__.__name__} 不支持 embed 能力")

    async def generate_image(
        self,
        prompt: str,
        size: str,
        reference_images: list[str] | None = None,
        *,
        n: int = 1,
    ) -> list[str]:
        """文生图/图生图（默认不支持）。"""
        raise RuntimeError(f"{self.__class__.__name__} 不支持 generate_image 能力")


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

    async def embed(
        self,
        text: str | None = None,
        image_base64_list: list[str] | None = None,
        instructions: str | None = None,
        dimensions: int | None = None,
    ) -> list[float]:
        """统一的 embedding 能力实现（当前仅支持纯文本）。"""

        # OpenAI embeddings 当前不支持多模态图片输入，如果调用方传了图片，直接抛错
        if image_base64_list:
            raise RuntimeError(
                "OpenAIClient 当前不支持带图片的多模态 embedding，请仅传入 text"
            )

        if not text:
            raise RuntimeError("OpenAIClient embed 需要提供 text 内容")

        client = self._ensure_connected()
        resp = await client.embeddings.create(model=self.model_name, input=text)
        return list(resp.data[0].embedding)

    async def generate_image(
        self,
        prompt: str,
        size: str,
        reference_images: list[str] | None = None,
        *,
        n: int = 1,
    ) -> list[str]:
        """统一的图片生成能力实现（OpenAI 兼容接口）。"""
        client = self._ensure_connected()
        extra_body: dict[str, Any] = {
            "watermark": False,
            "sequential_image_generation": "disabled",
        }

        # 如果提供了参考图片，添加到 extra_body
        if reference_images:
            extra_body["image"] = reference_images

        resp = await client.images.generate(
            model=self.model_name,
            response_format="b64_json",
            prompt=prompt,
            size=size,  # pyright: ignore[reportArgumentType]
            n=n,
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

    async def embed(
        self,
        text: str | None = None,
        image_base64_list: list[str] | None = None,
        instructions: str | None = None,
        dimensions: int | None = 1024,
    ) -> list[float]:
        """多模态 embedding 能力实现。

        Args:
            text: 文本内容，可选
            image_base64_list: Base64 格式图片列表，可选
            instructions: 向量化指令（推荐使用 InstructionBuilder 构建）
            dimensions: 向量维度，默认 1024
        """
        client = self._ensure_connected()

        if not text and not image_base64_list:
            raise RuntimeError("ArkClient embed 需要至少提供 text 或一张图片")

        # 构造输入列表
        input_list: list[EmbeddingInputParam] = []

        # 添加文本
        if text:
            input_list.append({"type": "text", "text": text})

        # 添加图片
        if image_base64_list:
            for image_base64 in image_base64_list:
                input_list.append(
                    {"type": "image_url", "image_url": {"url": image_base64}}
                )

        # 调用 API
        resp = await client.multimodal_embeddings.create(
            model=self.model_name,
            input=input_list,
            dimensions=dimensions or 1024,
            encoding_format="float",
            extra_body={"instructions": instructions or ""},
        )

        return resp.data.embedding

    async def generate_image(
        self,
        prompt: str,
        size: str,
        reference_images: list[str] | None = None,
        *,
        n: int = 1,
    ) -> list[str]:
        """Ark 图片生成能力，接口与 OpenAIClient 对齐。

        当前使用非流式、b64_json 的返回形式。
        """
        client = self._ensure_connected()

        resp = await client.images.generate(
            model=self.model_name,
            prompt=prompt,
            size=size,
            n=n,
            image=reference_images or None,
            response_format="b64_json",
            watermark=False,
            sequential_image_generation="disabled",
        )

        return [f"data:image/jpeg;base64,{image.b64_json}" for image in resp.data or []]


class AzureHttpClient(BaseAIClient[requests.Session]):
    """仅支持生图的 Azure HTTP 客户端。

    适配内部多模态生图接口（用法同 gptv），通过 HTTP 调用：
    - 使用 ModelProvider.base_url 作为完整的请求 URL
    - 使用 ModelProvider.model_name 作为请求体中的 model 字段
    - 只实现 generate_image 能力，embed 等其它能力一律不支持
    """

    def __init__(self, model_id: str) -> None:
        super().__init__(model_id)
        self._endpoint: str | None = None

    async def _create_client(self, model_info: dict) -> requests.Session:
        # 对于 HTTP 客户端，base_url 约定为完整的调用 URL
        self._endpoint = model_info["base_url"]
        return requests.Session()

    @staticmethod
    def _build_image_config(size: str) -> dict[str, Any]:
        """根据 size 构造 image_config。

        支持两类入参：
        - "1K" / "2K" / "4K"：直接映射到 imageSize，aspectRatio 默认为 1:1
        - "WxH"：像素尺寸，自动计算宽高比，并按最长边粗略映射到 1K/2K/4K
        """

        size_str = size.strip().upper()
        aspect_ratio = "1:1"
        image_size = "1K"

        if "X" in size_str:
            try:
                w_str, h_str = size_str.split("X", 1)
                w = int(w_str)
                h = int(h_str)
                if w > 0 and h > 0:
                    # 计算最简比例
                    from math import gcd

                    g = gcd(w, h)
                    aspect_ratio = f"{w // g}:{h // g}"

                    longest = max(w, h)
                    if longest <= 1440:
                        image_size = "1K"
                    elif longest <= 2048:
                        image_size = "2K"
                    else:
                        image_size = "4K"
            except Exception:
                # 解析失败时退回默认配置
                aspect_ratio = "1:1"
                image_size = "1K"
        elif size_str in {"1K", "2K", "4K"}:
            image_size = size_str

        return {
            "aspectRatio": aspect_ratio,
            "imageSize": image_size,
            "imageOutputOptions": {"mimeType": "image/png"},
        }

    async def generate_image(
        self,
        prompt: str,
        size: str,
        reference_images: list[str] | None = None,
        *,
        n: int = 1,
    ) -> list[str]:
        """调用 HTTP 多模态生图接口。

        当前实现：
        - 仅支持生成单张图片（忽略 n>1 的情况）
        - 支持携带参考图片 URL
        """

        if not self._endpoint:
            raise RuntimeError("AzureHttpClient 未正确初始化 endpoint")

        session = self._ensure_connected()

        # 构造 messages：文本 + 可选参考图（用 image_url.url）
        contents: list[dict[str, Any]] = [
            {"type": "text", "text": prompt},
        ]

        if reference_images:
            for url in reference_images:
                contents.append({"type": "image_url", "image_url": {"url": url}})

        payload: dict[str, Any] = {
            "stream": False,
            "model": self.model_name,
            "max_tokens": 20000,
            "messages": [
                {
                    "role": "user",
                    "content": contents,
                }
            ],
            "response_modalities": ["TEXT", "IMAGE"],
            "image_config": self._build_image_config(size),
        }

        def _do_request() -> dict[str, Any]:
            headers = {
                "Content-Type": "application/json",
            }
            resp = session.post(
                self._endpoint or "", json=payload, headers=headers, timeout=60
            )
            resp.raise_for_status()
            return resp.json()

        data = await asyncio.to_thread(_do_request)

        # 解析返回的多模态内容，只提取图片
        choices = data.get("choices") or []
        if not choices:
            raise RuntimeError("HTTP 生图接口未返回 choices")

        message = choices[0].get("message") or {}
        multimodal_contents = message.get("multimodal_contents") or []

        images: list[str] = []
        for item in multimodal_contents:
            if item.get("type") != "inline_data":
                continue
            inline_data = item.get("inline_data") or {}
            mime_type = inline_data.get("mime_type") or "image/png"
            b64_data = inline_data.get("data")
            if b64_data:
                images.append(f"data:{mime_type};base64,{b64_data}")

        if not images:
            raise RuntimeError("HTTP 生图接口未在响应中找到图片数据")

        # 目前接口实际上只返回单图，按统一约定返回列表
        return images
