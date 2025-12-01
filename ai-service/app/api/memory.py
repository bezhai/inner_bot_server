"""
记忆管理API
提供用户画像、群聊画像的CRUD操作，以及废弃的L3记忆接口（保留用于兼容）
"""

import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.memory.profile_agent import update_profiles_from_messages
from app.memory.profile_service import (
    batch_get_user_profiles,
    batch_update_user_profiles,
    get_group_profile,
    get_user_profile,
    update_group_profile,
    update_user_profile,
)
from app.memory.worker import _get_messages_by_time_range

router = APIRouter()
logger = logging.getLogger(__name__)


# ==================== 请求/响应模型 ====================


class UserProfileUpdate(BaseModel):
    """用户画像更新请求"""

    user_id: str
    profile_data: dict[str, Any]


class GroupProfileUpdate(BaseModel):
    """群聊画像更新请求"""

    profile_data: dict[str, Any]


class BatchUserProfileUpdate(BaseModel):
    """批量用户画像更新请求"""

    updates: list[UserProfileUpdate]


class ManualProfileUpdateRequest(BaseModel):
    """手动触发画像更新请求"""

    start_time: str | None = None  # ISO格式
    end_time: str | None = None  # ISO格式
    hours: int | None = None  # 不指定时默认2小时


class ProfileResponse(BaseModel):
    """画像响应"""

    success: bool = True
    data: dict[str, Any] | None = None
    message: str | None = None


# ==================== 用户画像API ====================


@router.get("/profile/user/{user_id}", response_model=ProfileResponse)
async def get_user_profile_api(user_id: str):
    """
    获取用户画像

    Args:
        user_id: 用户ID

    Returns:
        用户画像数据
    """
    try:
        profile = await get_user_profile(user_id)
        if profile is None:
            return ProfileResponse(
                success=True, data={}, message="该用户暂无画像记录"
            )
        return ProfileResponse(success=True, data=profile)
    except Exception as e:
        logger.error(f"获取用户画像失败 {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取失败: {str(e)}") from e


@router.post("/profile/user/{user_id}", response_model=ProfileResponse)
async def update_user_profile_api(user_id: str, request: GroupProfileUpdate):
    """
    更新用户画像

    Args:
        user_id: 用户ID
        request: 画像更新数据

    Returns:
        更新结果
    """
    try:
        success = await update_user_profile(user_id, request.profile_data, merge=True)
        if success:
            return ProfileResponse(success=True, message="用户画像更新成功")
        else:
            return ProfileResponse(success=False, message="用户画像更新失败")
    except Exception as e:
        logger.error(f"更新用户画像失败 {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"更新失败: {str(e)}") from e


@router.post("/profile/users/batch", response_model=ProfileResponse)
async def batch_get_user_profiles_api(user_ids: list[str]):
    """
    批量获取用户画像

    Args:
        user_ids: 用户ID列表

    Returns:
        用户画像字典
    """
    try:
        profiles = await batch_get_user_profiles(user_ids)
        return ProfileResponse(
            success=True,
            data=profiles,
            message=f"获取到 {len(profiles)} 个用户画像",
        )
    except Exception as e:
        logger.error(f"批量获取用户画像失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取失败: {str(e)}") from e


@router.put("/profile/users/batch", response_model=ProfileResponse)
async def batch_update_user_profiles_api(request: BatchUserProfileUpdate):
    """
    批量更新用户画像

    Args:
        request: 批量更新请求

    Returns:
        更新结果
    """
    try:
        updates = [
            {"user_id": u.user_id, "profile_data": u.profile_data}
            for u in request.updates
        ]
        results = await batch_update_user_profiles(updates, merge=True)
        success_count = sum(1 for v in results.values() if v)
        return ProfileResponse(
            success=True,
            data=results,
            message=f"更新完成，成功 {success_count}/{len(updates)} 个",
        )
    except Exception as e:
        logger.error(f"批量更新用户画像失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"更新失败: {str(e)}") from e


# ==================== 群聊画像API ====================


@router.get("/profile/group/{chat_id}", response_model=ProfileResponse)
async def get_group_profile_api(chat_id: str):
    """
    获取群聊画像

    Args:
        chat_id: 群聊ID

    Returns:
        群聊画像数据
    """
    try:
        profile = await get_group_profile(chat_id)
        if profile is None:
            return ProfileResponse(
                success=True, data={}, message="该群聊暂无画像记录"
            )
        return ProfileResponse(success=True, data=profile)
    except Exception as e:
        logger.error(f"获取群聊画像失败 {chat_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取失败: {str(e)}") from e


@router.post("/profile/group/{chat_id}", response_model=ProfileResponse)
async def update_group_profile_api(chat_id: str, request: GroupProfileUpdate):
    """
    更新群聊画像

    Args:
        chat_id: 群聊ID
        request: 画像更新数据

    Returns:
        更新结果
    """
    try:
        success = await update_group_profile(chat_id, request.profile_data, merge=True)
        if success:
            return ProfileResponse(success=True, message="群聊画像更新成功")
        else:
            return ProfileResponse(success=False, message="群聊画像更新失败")
    except Exception as e:
        logger.error(f"更新群聊画像失败 {chat_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"更新失败: {str(e)}") from e


# ==================== 画像更新触发API ====================


@router.post("/profile/update/{chat_id}", response_model=ProfileResponse)
async def trigger_profile_update(chat_id: str, request: ManualProfileUpdateRequest):
    """
    手动触发画像更新

    根据指定的时间范围获取消息并更新画像

    Args:
        chat_id: 群聊ID
        request: 更新请求参数

    Returns:
        更新结果
    """
    try:
        # 解析时间参数
        if request.start_time:
            start_dt = datetime.fromisoformat(request.start_time)
            start_ts = int(start_dt.timestamp() * 1000)
        else:
            # 默认往前推hours小时
            hours = request.hours or 2
            start_ts = int((datetime.now().timestamp() - hours * 3600) * 1000)

        if request.end_time:
            end_dt = datetime.fromisoformat(request.end_time)
            end_ts = int(end_dt.timestamp() * 1000)
        else:
            end_ts = int(datetime.now().timestamp() * 1000)

        # 获取消息
        messages = await _get_messages_by_time_range(chat_id, start_ts, end_ts)

        if not messages:
            return ProfileResponse(
                success=True, message="指定时间范围内无消息", data={"message_count": 0}
            )

        # 执行画像更新
        result = await update_profiles_from_messages(chat_id, messages)

        return ProfileResponse(
            success=result.get("success", False),
            data=result,
            message=f"处理 {len(messages)} 条消息",
        )

    except ValueError as e:
        logger.error(f"时间格式错误: {str(e)}")
        raise HTTPException(status_code=400, detail=f"时间格式错误: {str(e)}") from e
    except Exception as e:
        logger.error(f"画像更新失败 {chat_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"更新失败: {str(e)}") from e


# ==================== 废弃的L3记忆API（保留用于兼容） ====================


class ManualEvolveRequest(BaseModel):
    """记忆更新请求模型（已废弃）"""

    start_time: str | None = None
    end_time: str | None = None
    days: int | None = None
    limit: int = 20000


class Memory(BaseModel):
    """群组记忆模型（已废弃）"""

    memory_id: str
    group_id: str
    statement: str
    version: int
    created_at: str
    updated_at: str
    parent_id: str | None = None
    change_summary: str | None = None
    status: str = "active"
    strength: float = 0.8


class MemoryListResponse(BaseModel):
    """记忆列表响应（已废弃）"""

    success: bool = True
    group_id: str
    total: int
    memories: list[Memory]


class MemorySearchResponse(BaseModel):
    """记忆搜索响应（已废弃）"""

    success: bool = True
    query: str
    results: list[dict[str, Any]]


@router.post("/memory/evolve/{group_id}")
async def evolve_group_memories(group_id: str, request: ManualEvolveRequest):
    """
    触发群组记忆更新（已废弃）

    此接口已废弃，请使用 /profile/update/{chat_id} 代替

    Args:
        group_id: 群组ID
        request: 更新请求参数

    Returns:
        提示使用新接口
    """
    logger.warning(f"调用了废弃的evolve_group_memories接口: {group_id}")

    return {
        "success": False,
        "message": "此接口已废弃，请使用 POST /profile/update/{chat_id} 代替",
        "new_endpoint": f"/profile/update/{group_id}",
    }


@router.get("/memory/list/{group_id}", response_model=MemoryListResponse)
async def list_group_memories(
    group_id: str,
    status: str = Query(default="active", pattern="^(active|deprecated|all)$"),
    limit: int = Query(default=20, ge=1, le=100),
):
    """
    列出群组记忆（已废弃）

    此接口已废弃，请使用 /profile/group/{chat_id} 代替

    Args:
        group_id: 群组ID
        status: 记忆状态过滤
        limit: 返回数量限制

    Returns:
        空列表和废弃提示
    """
    logger.warning(f"调用了废弃的list_group_memories接口: {group_id}")

    return MemoryListResponse(
        success=True,
        group_id=group_id,
        total=0,
        memories=[],
    )


@router.get("/memory/search/{group_id}", response_model=MemorySearchResponse)
async def search_group_memories(
    group_id: str,
    q: str = Query(..., min_length=1, description="搜索查询文本"),
    limit: int = Query(default=5, ge=1, le=20),
    threshold: float = Query(default=0.7, ge=0.0, le=1.0),
):
    """
    语义搜索群组记忆（已废弃）

    此接口已废弃，新系统不再支持向量搜索

    Args:
        group_id: 群组ID
        q: 搜索查询文本
        limit: 返回数量限制
        threshold: 相似度阈值

    Returns:
        空结果和废弃提示
    """
    logger.warning(f"调用了废弃的search_group_memories接口: {group_id}")

    return MemorySearchResponse(
        success=True,
        query=q,
        results=[],
    )


@router.get("/memory/stats/{group_id}")
async def get_memory_stats(group_id: str):
    """
    获取群组记忆统计信息（已废弃）

    此接口已废弃，请使用 /profile/group/{chat_id} 代替

    Args:
        group_id: 群组ID

    Returns:
        废弃提示
    """
    logger.warning(f"调用了废弃的get_memory_stats接口: {group_id}")

    # 返回新系统的画像数据
    profile = await get_group_profile(group_id)

    return {
        "success": True,
        "group_id": group_id,
        "message": "此接口已废弃，返回新系统画像数据",
        "profile": profile or {},
    }
