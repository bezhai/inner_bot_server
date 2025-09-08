import asyncio
import logging
import re
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage

from app.clients import memory_client
from app.clients.image_client import image_client

logger = logging.getLogger(__name__)


async def load_memory(
    message_id: str,
) -> tuple[list[HumanMessage | AIMessage], list[str] | None]:
    """加载历史消息，支持图片多模态"""
    results = await memory_client.quick_search(
        context_message_id=message_id,
        max_results=15,
    )

    messages = []
    image_urls = []
    for result in results:
        # 处理消息内容，支持图片多模态
        content, urls = await process_message_content(result)
        image_urls.extend(urls)

        if result.get("role") == "user":
            messages.append(HumanMessage(content=content))
        else:
            messages.append(AIMessage(content=content))
    return messages, image_urls


async def process_message_content(result: dict) -> tuple[Any, list[str]]:
    """处理消息内容，支持图片多模态"""
    raw_content = result.get("content", "")
    user_name = result.get("user_name", "未知用户")
    message_id = result.get("message_id", "")
    need_message_id = result.get("role") == "user"  # 仅用户消息需要传递 message_id

    # 直接提取图片keys
    image_keys = re.findall(r"!\[image\]\(([^)]+)\)", raw_content)

    if not image_keys:
        return f"[{user_name}]: {raw_content}", []

    # 并发处理所有图片
    image_tasks = [
        image_client.process_image(key, message_id if need_message_id else None)
        for key in image_keys
    ]
    image_results = await asyncio.gather(*image_tasks, return_exceptions=True)

    # 构建多模态内容
    content_parts = []
    remaining_text = raw_content

    for i, image_key in enumerate(image_keys):
        marker = f"![image]({image_key})"
        before, after = remaining_text.split(marker, 1)

        # 添加前面的文本
        if before.strip():
            content_parts.append({"type": "text", "text": before.strip()})

        # 添加图片
        image_result = image_results[i]
        if isinstance(image_result, str) and image_result:
            content_parts.append(
                {"type": "image_url", "image_url": {"url": image_result}}
            )
        else:
            content_parts.append({"type": "text", "text": f"[图片: {image_key}]"})

        remaining_text = after

    # 添加最后的文本
    if remaining_text.strip():
        content_parts.append({"type": "text", "text": remaining_text.strip()})

    # 用户名只加在第一个文本部分
    if content_parts and content_parts[0]["type"] == "text":
        content_parts[0]["text"] = f"[{user_name}]: {content_parts[0]['text']}"
    elif content_parts:
        content_parts.insert(0, {"type": "text", "text": f"[{user_name}]: "})

    return content_parts, [image for image in image_results if isinstance(image, str)]
