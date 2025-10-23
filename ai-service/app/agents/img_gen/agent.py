import asyncio
import logging
from typing import Annotated, Any

from langchain.tools import ToolRuntime, tool
from pydantic import Field

from app.agents.basic.context import ContextSchema
from app.agents.basic.origin_client import OpenAIClient

logger = logging.getLogger(__name__)


@tool
async def generate_image(
    query: Annotated[
        str,
        Field(
            description="""一个明确的生成图片提示词
编写指南：
1. 用自然语言清晰描述画面
建议用简洁连贯的自然语言写明 主体 + 行为 + 环境，若对画面美学有要求，
可用自然语言或短语补充 风格、色彩、光影、构图 等美学元素。
- 示例：一个穿着华丽服装的女孩，撑着遮阳伞走在林荫道上，莫奈油画风格。
- 避免：一个女孩，撑伞，林荫街道，油画般的细腻笔触。
2. 明确应用场景和用途
当有明确的应用场景时，推荐在文本提示中写明图像用途和类型。
- 示例：设计一个游戏公司的 logo，主体是一只在用游戏手柄打游戏的狗，logo 上写有公司名 “PITBULL”。
- 避免：一张抽象图片，狗拿着游戏手柄，狗狗上写 PITBULL。
3. 提升风格渲染效果
如果有明确的风格需求，使用精准的 风格词 或提供 参考图像，能获得更理想的效果。
4. 提高文本渲染准确度
建议将要生成的 文字内容 放在 双引号 中。
- 示例：生成一张海报，标题为 “Seedream 4.0”
- 避免：生成一张海报，标题为 Seedream 4.0
              """
        ),
    ],
    size: Annotated[
        str,
        Field(
            description="""图片尺寸
            方法一：指定生成图像的分辨率，并在prompt中用自然语言描述图片宽高比、图片形状或图片用途
            可选值：1K、2K、4K
            方法二：指定生成图像的宽高像素值
            总像素取值范围：[1280x720, 4096x4096]
            宽高比取值范围：[1/16, 16]"""
        ),
    ],
    image_list: Annotated[
        list[int],
        Field(
            description="参考图片列表，使用文本中的图片编号，从1开始（如【图片1】对应编号1）, 如果为空，则不使用参考图片"
        ),
    ],
    runtime: ToolRuntime[ContextSchema],
) -> str | dict[str, Any]:
    """
    通过文本提示词生成图片, 返回图片image_key
    """
    try:
        # 获取runtime context中的图片URL列表
        image_url_list = []
        try:
            image_url_list = runtime.context.image_url_list or []
        except Exception as e:
            logger.warning(f"无法获取runtime context，参考图片功能不可用: {e}")

        # 根据image_list获取实际的图片URLs
        reference_urls = []
        if image_list and image_url_list:
            for idx in image_list:
                # 编号从1开始，转换为数组索引（从0开始）
                array_index = idx - 1
                if 0 <= array_index < len(image_url_list):
                    reference_urls.append(image_url_list[array_index])
                else:
                    logger.warning(
                        f"图片编号 {idx} 超出范围（总共 {len(image_url_list)} 张图片）"
                    )

        if reference_urls:
            logger.info(f"使用参考图片: {reference_urls}")

        async with OpenAIClient("doubao:doubao-seedream-4-0-250828") as client:
            base64_images = await client.images_generate(
                query, size, reference_urls if reference_urls else None
            )

            image_keys = await batch_upload_images(base64_images=base64_images)
            return {
                "image_keys": image_keys,
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
