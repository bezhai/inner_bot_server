import logging
from typing import Iterable

from langchain_core.messages import AIMessage, HumanMessage

from app.agents.basic import ChatAgent


logger = logging.getLogger(__name__)


def _parse_yes_no_output(text: str) -> bool:
    """
    解析小模型输出为布尔值：期望严格 yes/no。
    返回 True 表示 yes，False 表示 no；其他内容一律按 False 处理。
    """
    if not isinstance(text, str):
        return False
    normalized = text.strip().lower()
    if normalized.startswith("yes") or normalized == "y":
        return True
    if normalized.startswith("no") or normalized == "n":
        return False
    return False


async def binary_classify(
    model_id: str,
    prompt_id: str,
    messages: list[HumanMessage | AIMessage] | Iterable[HumanMessage | AIMessage],
) -> bool:
    """
    统一的二分类（yes/no）分类器执行器。

    - model_id: 小模型 id（与实际名称一致的占位）
    - prompt_id: 对应外部提示词 id（占位）
    - messages: 历史消息上下文
    """
    try:
        agent = ChatAgent(model_id, prompt_id, tools=[])
        result = await agent.run(list(messages))
        content = result.content if isinstance(result, AIMessage) else None
        return _parse_yes_no_output(content or "")
    except Exception as e:
        logger.error(f"binary_classify failed: {model_id}/{prompt_id}, error: {e}")
        # 安全降级：分类失败默认 False
        return False


async def run_once(
    model_id: str,
    prompt_id: str,
    messages: list[HumanMessage | AIMessage] | Iterable[HumanMessage | AIMessage],
) -> AIMessage:
    """
    以给定模型与提示，执行一次性非流式推理，返回最终 AIMessage。
    工具集按需后续扩展，当前按要求置空。
    """
    agent = ChatAgent(model_id, prompt_id, tools=[])
    return await agent.run(list(messages))

