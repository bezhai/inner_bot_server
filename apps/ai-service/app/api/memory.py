"""
画像管理 API
"""

import logging

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.memory.l3_memory_service import evolve_group_profile
from app.utils.time_parser import TimeRangeParser

router = APIRouter()
logger = logging.getLogger(__name__)


class ManualProfileUpdateRequest(BaseModel):
    """画像更新请求（支持新旧两种方式）"""

    # 新增：灵活的时间范围表达
    start_time: str = Field(
        description="开始时间，支持格式：'YYYY-MM-DD' 或 'YYYY-MM-DD HH:mm'",
        examples=["2024-01-01", "2024-01-01 14:30"],
    )
    end_time: str | None = Field(
        None,
        description="结束时间（可选，默认为当前时间），格式同 start_time",
        examples=["2024-01-31", "2024-01-31 23:59"],
    )

    force: bool = Field(False, description="是否强制更新")

    split_cnt: int | None = Field(
        None,
        description="分割消息数量阈值",
        examples=[100],
    )


@router.post("/memory/evolve/{group_id}")
async def evolve_group_profile_api(group_id: str, request: ManualProfileUpdateRequest):
    """
    手动触发群聊画像更新
    """

    start_dt = TimeRangeParser.parse_time_input(
        request.start_time, default_to_now=False
    )
    end_dt = TimeRangeParser.parse_time_input(request.end_time, default_to_now=True)

    if start_dt >= end_dt:
        raise ValueError(f"开始时间必须早于结束时间: start={start_dt}, end={end_dt}")

    await evolve_group_profile(
        group_id,
        TimeRangeParser.to_milliseconds(start_dt),
        TimeRangeParser.to_milliseconds(end_dt),
        split_cnt=request.split_cnt,
    )
