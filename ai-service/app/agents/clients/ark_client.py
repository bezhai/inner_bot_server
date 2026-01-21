"""Ark 客户端实现（火山引擎）"""

from volcenginesdkarkruntime import AsyncArk
from volcenginesdkarkruntime.types.multimodal_embedding import (
    EmbeddingInputParam,
)

from app.agents.clients.base import BaseAIClient


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
    ) -> list[str]:
        """Ark 图片生成能力，接口与 OpenAIClient 对齐。

        当前使用非流式、b64_json 的返回形式。
        """
        client = self._ensure_connected()

        resp = await client.images.generate(
            model=self.model_name,
            prompt=prompt,
            size=size,
            image=reference_images or None,
            response_format="b64_json",
            watermark=False,
            sequential_image_generation="disabled",
        )

        return [f"data:image/jpeg;base64,{image.b64_json}" for image in resp.data or []]
