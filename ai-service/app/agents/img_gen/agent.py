import asyncio
import logging
from typing import Annotated, Any

from langchain_core.tools import tool
from pydantic import Field

from app.agents.basic.origin_client import OpenAIClient

logger = logging.getLogger(__name__)


@tool
async def generate_image(
    query: Annotated[
        str,
        Field(description="一个明确的生成图片提示词, 例如 '帮我生成一张猫咪的图片'"),
    ],
    size: Annotated[
        str,
        Field(description="图片尺寸, 例如 '1024x1024', 或者以宽高比表示, 例如 '1:1'"),
    ] = "1024x1024",
    # image_list: Annotated[
    #     list[int] | None,
    #     Field(description="参考图片列表, 按当前上下文的图片顺序编号, 从0开始"),
    # ] = None,
) -> str | dict[str, Any]:
    """
    通过文本提示词生成图片, 返回图片url
    """
    try:
        # context = get_runtime(ContextSchema).context

        logger.info(f"生成图片请求: {query}")

        async with OpenAIClient("doubao:doubao-seedream-4-0-250828") as client:
            data = await client.images_generate(query, size)
            from app.clients.image_client import image_client

            image_key = await image_client.upload_base64_image(base64_data=data)
            return {
                "image_key": image_key,
            }

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
