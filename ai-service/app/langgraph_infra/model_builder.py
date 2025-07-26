"""
ModelBuilder - 统一的模型构建器

直接基于数据库操作，为langgraph提供统一的BaseChatModel实例构建功能
"""

import logging
from typing import Any

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_openai import ChatOpenAI
from sqlalchemy.future import select

from app.orm.base import AsyncSessionLocal
from app.orm.models import AIModel, ModelProvider

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
        从数据库获取模型和供应商信息

        Args:
            model_id: 模型ID

        Returns:
            Dict: 包含模型和供应商信息的字典，如果未找到返回None
        """
        try:
            async with AsyncSessionLocal() as session:
                # 查询模型信息
                result = await session.execute(
                    select(AIModel).where(AIModel.model_id == model_id)
                )
                model = result.scalar_one_or_none()
                if not model:
                    return None

                # 查询供应商信息
                provider_result = await session.execute(
                    select(ModelProvider).where(
                        ModelProvider.provider_id == model.provider_id
                    )
                )
                provider = provider_result.scalar_one_or_none()
                if not provider:
                    return None

                return {
                    "model_name": model.model_name or model.name,
                    "api_key": provider.api_key,
                    "base_url": provider.base_url,
                    "default_params": model.default_params,
                }
        except Exception as e:
            logger.error(f"数据库查询错误: {e}")
            return None

    @staticmethod
    async def build_chat_model(model_id: str, **kwargs) -> BaseChatModel:
        """
        根据model_id构建BaseChatModel实例

        Args:
            model_id: 内部模型ID，对应数据库中的model_id
            temperature: 温度参数，控制随机性 (0.0-2.0)
            max_tokens: 最大token数限制
            **kwargs: 其他langchain ChatOpenAI支持的参数

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
            }

            # 处理数据库中的默认参数
            if model_info.get("default_params") and isinstance(
                model_info["default_params"], dict
            ):
                default_params = model_info["default_params"]
                logger.debug(f"模型 {model_id} 的默认参数: {default_params}")
                # 只合并ChatOpenAI支持的参数
                supported_params = {
                    "temperature",
                    "max_tokens",
                    "top_p",
                    "frequency_penalty",
                    "presence_penalty",
                    "n",
                    "stop",
                    "stream",
                    "logit_bias",
                    "max_retries",
                    "request_timeout",
                    "seed",
                    "response_format",
                }
                filtered_params = {
                    k: v for k, v in default_params.items() if k in supported_params
                }
                chat_params.update(filtered_params)

            # 合并其他kwargs参数，同样进行过滤
            supported_params = {
                "temperature",
                "max_tokens",
                "top_p",
                "frequency_penalty",
                "presence_penalty",
                "n",
                "stop",
                "stream",
                "logit_bias",
                "max_retries",
                "request_timeout",
                "seed",
                "response_format",
            }
            filtered_kwargs = {k: v for k, v in kwargs.items() if k in supported_params}
            chat_params.update(filtered_kwargs)

            logger.info(
                f"为模型 {model_id} 构建ChatOpenAI实例，参数: {list(chat_params.keys())}"
            )

            # 创建ChatOpenAI实例
            return ChatOpenAI(**chat_params)

        except Exception as e:
            if isinstance(e, ModelBuilderError):
                raise

            # 其他未知异常
            logger.error(f"构建模型 {model_id} 时发生未知错误: {e}")
            raise ModelBuilderError(f"构建模型失败: {str(e)}")

    @staticmethod
    async def validate_model_id(model_id: str) -> bool:
        """
        验证model_id是否有效

        Args:
            model_id: 要验证的模型ID

        Returns:
            bool: 模型ID是否有效
        """
        try:
            model_info = await ModelBuilder._get_model_and_provider_info(model_id)
            return model_info is not None and model_info.get("is_active", True)
        except Exception:
            return False

    @staticmethod
    async def list_available_models() -> list[dict[str, Any]]:
        """
        列出所有可用的模型

        Returns:
            List[Dict]: 可用模型列表
        """
        try:
            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(AIModel).where(AIModel.is_active == True)
                )
                models = result.scalars().all()

                model_list = []
                for model in models:
                    model_list.append(
                        {
                            "model_id": model.model_id,
                            "name": model.name,
                            "description": model.description,
                            "is_multimodal": model.is_multimodal,
                            "is_thinking": model.is_thinking,
                            "is_default": model.is_default,
                        }
                    )

                return model_list
        except Exception as e:
            logger.error(f"列出可用模型时发生错误: {e}")
            raise ModelBuilderError(f"列出可用模型失败: {str(e)}")
