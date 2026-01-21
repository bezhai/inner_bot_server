"""Guard 状态定义"""

from dataclasses import dataclass
from typing import Annotated

from typing_extensions import TypedDict


@dataclass
class GuardResult:
    """单个检测节点的结果"""

    blocked: bool = False
    reason: str | None = None


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
