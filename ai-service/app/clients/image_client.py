"""
Main-server图片处理客户端
"""

import logging

import httpx

from app.config.config import settings
from app.utils.middlewares.trace import get_app_name, get_trace_id

logger = logging.getLogger(__name__)


class ImageProcessClient:
    """Main-server图片处理客户端"""

    def __init__(self):
        self.base_url = settings.main_server_base_url
        self.timeout = settings.main_server_timeout

    async def process_image(self, message_id: str, file_key: str) -> str | None:
        """
        处理图片，返回图片URL

        Args:
            message_id: 消息ID
            file_key: 图片文件key

        Returns:
            str: 图片URL，如果失败返回None
        """
        if not self.base_url:
            logger.warning("Main-server base URL未配置")
            return None

        try:
            request_data = {"message_id": message_id, "file_key": file_key}

            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/api/image/process",
                    json=request_data,
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {settings.inner_http_secret}",
                        "X-Trace-Id": get_trace_id() or "",
                        "X-App-Name": get_app_name() or "",
                    },
                )

                response.raise_for_status()
                data = response.json()

                if data.get("success") and data.get("data"):
                    logger.info(f"图片处理成功: {file_key} -> {data['data']['url']}")
                    return data["data"]["url"]
                else:
                    logger.error(f"图片处理失败: {data.get('message', '未知错误')}")
                    return None

        except httpx.TimeoutException:
            logger.warning(f"图片处理超时: {self.timeout}秒")
            return None
        except httpx.HTTPStatusError as e:
            logger.error(
                f"图片处理HTTP错误: {e.response.status_code} - {e.response.text}"
            )
            return None
        except Exception as e:
            logger.error(f"调用图片处理接口失败: {str(e)}")
            return None

    async def upload_base64_image(self, base64_data: str) -> str | None:
        """
        上传base64图片到飞书，返回image_key

        Args:
            base64_data: base64图片数据，需要包含data:image/...;base64,前缀

        Returns:
            str: image_key，如果失败返回None
        """
        if not self.base_url:
            logger.warning("Main-server base URL未配置")
            return None

        try:
            request_data = {"base64_data": base64_data}

            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/api/image/upload-base64",
                    json=request_data,
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {settings.inner_http_secret}",
                        "X-Trace-Id": get_trace_id() or "",
                        "X-App-Name": get_app_name() or "",
                    },
                )

                response.raise_for_status()
                data = response.json()

                if data.get("success") and data.get("data"):
                    logger.info(
                        f"base64图片上传成功，获得image_key: {data['data']['image_key']}"
                    )
                    return data["data"]["image_key"]
                else:
                    logger.error(
                        f"base64图片上传失败: {data.get('message', '未知错误')}"
                    )
                    return None

        except httpx.TimeoutException:
            logger.warning(f"base64图片上传超时: {self.timeout}秒")
            return None
        except httpx.HTTPStatusError as e:
            logger.error(
                f"base64图片上传HTTP错误: {e.response.status_code} - {e.response.text}"
            )
            return None
        except Exception as e:
            logger.error(f"调用base64图片上传接口失败: {str(e)}")
            return None


# 全局单例
image_client = ImageProcessClient()
