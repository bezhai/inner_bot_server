"""Guard 状态定义"""

from dataclasses import dataclass
from enum import Enum
from typing import Annotated

from typing_extensions import TypedDict


class BlockReason(str, Enum):
    """拦截原因枚举"""

    BANNED_WORD = "banned_word"  # 关键词命中
    PROMPT_INJECTION = "prompt_injection"  # 提示词注入
    SENSITIVE_POLITICS = "sensitive_politics"  # 敏感政治话题


@dataclass
class GuardResult:
    """单个检测节点的结果"""

    blocked: bool = False
    reason: BlockReason | None = None
    detail: str | None = None  # 额外详情，如命中的关键词


def merge_results(
    existing: list["GuardResult"], new: list["GuardResult"]
) -> list["GuardResult"]:
    """合并检测结果列表"""
    return existing + new


class GuardState(TypedDict):
    """Guard 图的状态"""

    # 输入：待检测的消息内容
    message_content: str

    # 检测结果列表（使用 reducer 合并并行节点的结果）
    check_results: Annotated[list[GuardResult], merge_results]

    # 最终判定：是否被拦截
    is_blocked: bool

    # 拦截原因（用于日志和审计）
    block_reason: BlockReason | None
