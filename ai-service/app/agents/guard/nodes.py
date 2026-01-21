"""Guard 检测节点实现

包含三类检测：
1. 关键词检测（快速，无 LLM 调用）
2. 系统提示词注入检测（LLM）
3. 敏感政治话题检测（LLM）

Prompt 通过 Langfuse 管理
"""

import logging

from langfuse.langchain import CallbackHandler
from pydantic import BaseModel, Field

from app.agents.basic.langfuse import get_prompt
from app.agents.basic.model_builder import ModelBuilder
from app.agents.guard.state import BlockReason, GuardResult, GuardState
from app.services.banned_word import check_banned_word

logger = logging.getLogger(__name__)


class PromptInjectionResult(BaseModel):
    """系统提示词注入检测结果"""

    is_injection: bool = Field(description="是否尝试获取系统提示词或进行提示词注入")
    confidence: float = Field(description="置信度 0-1", ge=0, le=1)


class PoliticsCheckResult(BaseModel):
    """敏感政治话题检测结果"""

    is_sensitive: bool = Field(description="是否涉及敏感政治话题")
    confidence: float = Field(description="置信度 0-1", ge=0, le=1)


async def check_banned_word_node(state: GuardState) -> dict:
    """关键词检测节点（快速，无 LLM 调用）"""
    message = state["message_content"]

    try:
        banned_word = await check_banned_word(message)

        if banned_word:
            logger.warning(f"检测到封禁词: {banned_word}")
            return {
                "check_results": [
                    GuardResult(
                        blocked=True,
                        reason=BlockReason.BANNED_WORD,
                        detail=banned_word,
                    )
                ]
            }

        return {"check_results": [GuardResult(blocked=False)]}

    except Exception as e:
        logger.error(f"关键词检测失败: {e}")
        return {"check_results": [GuardResult(blocked=False)]}


async def check_prompt_injection(state: GuardState, config) -> dict:
    """检测系统提示词注入攻击"""
    message = state["message_content"]

    try:
        # 从 Langfuse 获取 prompt
        langfuse_prompt = get_prompt("guard_prompt_injection")
        messages = langfuse_prompt.compile(message=message)

        model = await ModelBuilder.build_chat_model("guard-model")
        structured_model = model.with_structured_output(PromptInjectionResult)

        # 使用传入的 config 保持 trace 链路
        result: PromptInjectionResult = await structured_model.ainvoke(
            messages, config=config
        )

        if result.is_injection and result.confidence >= 0.7:
            logger.warning(f"检测到提示词注入攻击: confidence={result.confidence}")
            return {
                "check_results": [
                    GuardResult(
                        blocked=True,
                        reason=BlockReason.PROMPT_INJECTION,
                        detail=f"confidence={result.confidence}",
                    )
                ]
            }

        return {"check_results": [GuardResult(blocked=False)]}

    except Exception as e:
        logger.error(f"提示词注入检测失败: {e}")
        # 检测失败时放行，避免影响正常使用
        return {"check_results": [GuardResult(blocked=False)]}


async def check_sensitive_politics(state: GuardState, config) -> dict:
    """检测敏感政治话题"""
    message = state["message_content"]

    try:
        # 从 Langfuse 获取 prompt
        langfuse_prompt = get_prompt("guard_sensitive_politics")
        messages = langfuse_prompt.compile(message=message)

        model = await ModelBuilder.build_chat_model("guard-model")
        structured_model = model.with_structured_output(PoliticsCheckResult)

        # 使用传入的 config 保持 trace 链路
        result: PoliticsCheckResult = await structured_model.ainvoke(
            messages, config=config
        )

        if result.is_sensitive and result.confidence >= 0.7:
            logger.warning(f"检测到敏感政治话题: confidence={result.confidence}")
            return {
                "check_results": [
                    GuardResult(
                        blocked=True,
                        reason=BlockReason.SENSITIVE_POLITICS,
                        detail=f"confidence={result.confidence}",
                    )
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

    # 找到第一个命中的结果
    blocked_result = next((r for r in results if r.blocked), None)

    if blocked_result:
        logger.info(
            f"消息被拦截，原因: {blocked_result.reason}, 详情: {blocked_result.detail}"
        )
        return {
            "is_blocked": True,
            "block_reason": blocked_result.reason,
        }

    return {
        "is_blocked": False,
        "block_reason": None,
    }


def create_langfuse_config(trace_name: str = "guard") -> dict:
    """创建带 Langfuse 追踪的配置"""
    return {
        "callbacks": [CallbackHandler()],
        "run_name": trace_name,
    }
