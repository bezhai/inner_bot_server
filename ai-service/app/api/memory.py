"""
画像管理 API
"""

import logging
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config.config import settings
from app.memory.l3_memory_service import ProfileUpdateResult, evolve_group_profile
from app.orm import crud

router = APIRouter()
logger = logging.getLogger(__name__)


class ManualProfileUpdateRequest(BaseModel):
    start_time_ms: int | None = None
    force: bool = False


class ProfileUpsertRequest(BaseModel):
    profile: dict[str, Any]


def _serialize_profile_result(result: ProfileUpdateResult) -> dict[str, Any]:
    return {
        "group_id": result.group_id,
        "updated": result.updated,
        "message_count": result.message_count,
        "has_bot_mention": result.has_bot_mention,
        "reason": result.reason,
        "agent_summary": result.agent_summary,
        "window_start": result.window_start.isoformat()
        if result.window_start
        else None,
        "window_end": result.window_end.isoformat() if result.window_end else None,
    }


@router.post("/memory/evolve/{group_id}")
async def evolve_group_profile_api(group_id: str, request: ManualProfileUpdateRequest):
    """手动触发群聊画像更新"""
    if request.start_time_ms is not None and request.start_time_ms <= 0:
        raise HTTPException(status_code=400, detail="start_time_ms 必须为正整数")

    logger.info(
        "手动画像更新 group_id=%s force=%s start_ts_ms=%s",
        group_id,
        request.force,
        request.start_time_ms,
    )

    if request.start_time_ms is None:
        default_window_start = datetime.now() - timedelta(
            minutes=settings.l3_profile_scan_interval_minutes
        )
        start_ts_ms = int(default_window_start.timestamp() * 1000)
    else:
        start_ts_ms = request.start_time_ms

    result = await evolve_group_profile(
        group_id,
        start_ts_ms,
        force=request.force,
    )
    logger.info(
        "手动画像更新完成 group_id=%s updated=%s reason=%s",
        group_id,
        result.updated,
        result.reason,
    )
    return _serialize_profile_result(result)


@router.get("/memory/profile/group/{chat_id}")
async def get_group_profile_api(chat_id: str):
    profile = await crud.fetch_group_profile(chat_id)
    return {"chat_id": chat_id, "profile": profile or {}}


@router.put("/memory/profile/group/{chat_id}")
async def upsert_group_profile_api(chat_id: str, payload: ProfileUpsertRequest):
    await crud.upsert_group_profile(chat_id, payload.profile)
    return {"chat_id": chat_id, "profile": payload.profile}


@router.get("/memory/profile/user/{user_id}")
async def get_user_profile_api(user_id: str):
    profiles = await crud.fetch_user_profiles([user_id])
    return {"user_id": user_id, "profile": profiles.get(user_id) or {}}


@router.put("/memory/profile/user/{user_id}")
async def upsert_user_profile_api(user_id: str, payload: ProfileUpsertRequest):
    await crud.upsert_user_profiles([(user_id, payload.profile)])
    return {"user_id": user_id, "profile": payload.profile}
