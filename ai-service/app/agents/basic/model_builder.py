"""
ModelBuilder - 统一的模型构建器

直接基于数据库操作，为langgraph提供统一的BaseChatModel实例构建功能
"""

import logging
from typing import Any

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_openai import ChatOpenAI

from .exceptions import ModelBuilderError, ModelConfigError, UnsupportedModelError

logger = logging.getLogger(__name__)


class ModelBuilder:
    """
    模型构建器

    提供统一的接口来构建langgraph可用的BaseChatModel实例
    当前统一映射到ChatOpenAI，后期可扩展支持其他模型类型
    """

    @staticmethod
    async def _get_model_and_provider_info(model_id: str) -> dict[str, Any] | None:
        """
        从数据库获取供应商信息

        解析model_id格式："{供应商名称}:模型原名"
        如果找不到供应商名称，则使用默认的302.ai

        Args:
            model_id: 格式为"供应商名称/模型原名"的字符串

        Returns:
            Dict: 包含模型和供应商信息的字典，如果未找到返回None
        """
        try:
            from app.orm.crud import get_model_and_provider_info

            return await get_model_and_provider_info(model_id)
        except Exception as e:
            logger.error(f"数据库查询错误: {e}")
            return None

    @staticmethod
    async def get_basic_model_params(model_id: str) -> dict[str, Any] | None:
        """
        获取基础模型参数

        Args:
            model_id: 内部模型ID，对应数据库中的model_id

        Returns:
            Dict: 包含基础模型参数的字典，如果未找到返回None
        """
        model_info = await ModelBuilder._get_model_and_provider_info(model_id)
        if model_info is None or not model_info.get("is_active", True):
            return None

        required_fields = ["api_key", "base_url", "model_name"]
        if any(
            field not in model_info or not model_info[field]
            for field in required_fields
        ):
            return None

        return {
            "api_key": model_info["api_key"],
            "base_url": model_info["base_url"],
            "model": model_info["model_name"],
            "client_type": model_info["client_type"],
        }

    @staticmethod
    async def build_chat_model(model_id: str, **kwargs) -> BaseChatModel:
        """
        根据model_id构建BaseChatModel实例

        Args:
            model_id: 内部模型ID，对应数据库中的model_id

        Returns:
            BaseChatModel实例，可直接用于langgraph

        Raises:
            ModelConfigError: 模型配置错误
            UnsupportedModelError: 不支持的模型类型
            ModelBuilderError: 其他构建错误
        """
        try:
            # 从数据库获取模型信息
            model_info = await ModelBuilder._get_model_and_provider_info(model_id)

            if model_info is None:
                raise UnsupportedModelError(model_id, f"未找到模型信息: {model_id}")

            # 检查模型是否激活
            if not model_info.get("is_active", True):
                raise UnsupportedModelError(model_id, f"模型已禁用: {model_id}")

            # 验证必要字段
            required_fields = ["api_key", "base_url", "model_name"]
            missing_fields = [
                field for field in required_fields if not model_info.get(field)
            ]
            if missing_fields:
                raise ModelConfigError(
                    model_id, f"模型配置缺少必要字段: {', '.join(missing_fields)}"
                )

            # 准备ChatOpenAI参数
            chat_params = {
                "api_key": model_info["api_key"],
                "base_url": model_info["base_url"],
                "model": model_info["model_name"],
                **kwargs,
            }

            logger.info(
                f"为模型 {model_id} 构建ChatOpenAI实例，"
                f"参数: {list(chat_params.keys())}"
            )

            # 创建ChatOpenAI实例
            return ChatOpenAI(**chat_params)

        except Exception as e:
            if isinstance(e, ModelBuilderError):
                raise

            # 其他未知异常
            logger.error(f"构建模型 {model_id} 时发生未知错误: {e}")
            raise ModelBuilderError(f"构建模型失败: {str(e)}") from e
