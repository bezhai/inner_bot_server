import asyncio
import logging
from typing import Annotated, Any

from langchain_core.tools import tool
from langgraph.runtime import get_runtime
from pydantic import Field

from app.agents.basic.context import ContextSchema
from app.agents.basic.origin_client import OpenAIClient

logger = logging.getLogger(__name__)


@tool
async def generate_image(
    query: Annotated[
        str,
        Field(description="一个明确的生成图片提示词, 例如 '帮我生成一张猫咪的图片'"),
    ],
    image_list: Annotated[
        list[int] | None,
        Field(description="参考图片列表, 按当前上下文的图片顺序编号, 从0开始"),
    ] = None,
) -> str | dict[str, Any]:
    """
    通过文本提示词和参考图片(可选)生成图片, 返回图片 id 列表和描述
    """
    try:
        context = get_runtime(ContextSchema).context

        async with OpenAIClient(
            "openrouter:google/gemini-2.5-flash-image-preview"
        ) as client:
            completion = await client.chat_completion(
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": query},
                            *[
                                {
                                    "type": "image_url",
                                    "image_url": {"url": context.image_url_list[i]},
                                }
                                for i in (image_list or [])
                                if 0 <= i < len(context.image_url_list)
                            ],
                        ],
                    }
                ]  # 这里可以根据需要添加更多的上下文消息
            )
            message = completion.choices[0].message

            logger.info(f"生成图片结果: {message}")

            response = {"description": message.content, "images": []}

            if hasattr(message, "images"):
                base64_images = [img["image_url"]["url"] for img in message.images]  # type: ignore
                image_keys = await batch_upload_images(base64_images)
                response["images"] = image_keys
                return response

        return "抱歉，处理您的请求时出现错误: 未能生成图片"

    except Exception as e:
        logger.error(f"Bangumi agent执行失败: {str(e)}")
        return f"抱歉，处理您的请求时出现错误: {str(e)}"


async def batch_upload_images(base64_images: list[str]) -> list[str]:
    """
    批量上传图片, 返回图片 keys 列表
    """
    from app.clients.image_client import image_client

    tasks = [
        image_client.upload_base64_image(base64_data=base64_image)
        for base64_image in base64_images
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    image_keys = []
    for result in results:
        if isinstance(result, Exception):
            logger.error(f"图片上传失败: {str(result)}")
        elif isinstance(result, str) and result:
            image_keys.append(result)

    return image_keys
