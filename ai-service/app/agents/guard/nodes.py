"""Guard 检测节点实现

使用 LLM 进行意图分类检测，prompt 通过 Langfuse 管理
"""

import logging

from pydantic import BaseModel, Field

from app.agents.basic.langfuse import get_prompt
from app.agents.basic.model_builder import ModelBuilder
from app.agents.guard.state import GuardResult, GuardState

logger = logging.getLogger(__name__)


class PromptInjectionResult(BaseModel):
    """系统提示词注入检测结果"""

    is_injection: bool = Field(description="是否尝试获取系统提示词或进行提示词注入")
    confidence: float = Field(description="置信度 0-1", ge=0, le=1)


class PoliticsCheckResult(BaseModel):
    """敏感政治话题检测结果"""

    is_sensitive: bool = Field(description="是否涉及敏感政治话题")
    confidence: float = Field(description="置信度 0-1", ge=0, le=1)


async def check_prompt_injection(state: GuardState) -> dict:
    """检测系统提示词注入攻击"""
    message = state["message_content"]

    try:
        # 从 Langfuse 获取 prompt
        langfuse_prompt = get_prompt("guard_prompt_injection")
        messages = langfuse_prompt.compile(message=message)

        model = await ModelBuilder.build_chat_model("guard-model")
        structured_model = model.with_structured_output(PromptInjectionResult)

        result: PromptInjectionResult = await structured_model.ainvoke(messages)

        if result.is_injection and result.confidence >= 0.7:
            logger.warning(f"检测到提示词注入攻击: confidence={result.confidence}")
            return {
                "check_results": [GuardResult(blocked=True, reason="prompt_injection")]
            }

        return {"check_results": [GuardResult(blocked=False)]}

    except Exception as e:
        logger.error(f"提示词注入检测失败: {e}")
        # 检测失败时放行，避免影响正常使用
        return {"check_results": [GuardResult(blocked=False)]}


async def check_sensitive_politics(state: GuardState) -> dict:
    """检测敏感政治话题"""
    message = state["message_content"]

    try:
        # 从 Langfuse 获取 prompt
        langfuse_prompt = get_prompt("guard_sensitive_politics")
        messages = langfuse_prompt.compile(message=message)

        model = await ModelBuilder.build_chat_model("guard-model")
        structured_model = model.with_structured_output(PoliticsCheckResult)

        result: PoliticsCheckResult = await structured_model.ainvoke(messages)

        if result.is_sensitive and result.confidence >= 0.7:
            logger.warning(f"检测到敏感政治话题: confidence={result.confidence}")
            return {
                "check_results": [
                    GuardResult(blocked=True, reason="sensitive_politics")
                ]
            }

        return {"check_results": [GuardResult(blocked=False)]}

    except Exception as e:
        logger.error(f"敏感政治检测失败: {e}")
        # 检测失败时放行，避免影响正常使用
        return {"check_results": [GuardResult(blocked=False)]}


def aggregate_results(state: GuardState) -> dict:
    """聚合所有检测结果，判断是否需要拦截"""
    results = state["check_results"]

    # 任一检测命中则拦截
    is_blocked = any(r.blocked for r in results)

    if is_blocked:
        blocked_reasons = [r.reason for r in results if r.blocked and r.reason]
        logger.info(f"消息被拦截，原因: {blocked_reasons}")

    return {"is_blocked": is_blocked}
