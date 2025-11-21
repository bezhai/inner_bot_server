"""
群组记忆管理API
提供L3群组长期记忆的CRUD和演进操作
"""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.memory.l3_memory_service import (
    Memory,
    evolve_memories,
    get_active_memories,
    search_relevant_memories,
)

router = APIRouter()
logger = logging.getLogger(__name__)


# ==================== 响应模型 ====================


class MemoryListResponse(BaseModel):
    """记忆列表响应"""

    success: bool = True
    group_id: str
    total: int
    memories: list[Memory]


class MemorySearchResponse(BaseModel):
    """记忆搜索响应"""

    success: bool = True
    query: str
    results: list[dict[str, Any]]


# ==================== API接口 ====================


@router.post("/memory/evolve/{group_id}")
async def evolve_group_memories(
    group_id: str,
    days: int = Query(default=1, ge=1, le=7, description="获取最近N天的消息"),
):
    """
    触发群组记忆演进

    这个接口会：
    1. 获取群组现有的活跃记忆
    2. 获取最近N天的新消息
    3. 使用LLM融合演进记忆
    4. 返回演进统计结果

    Args:
        group_id: 群组ID
        days: 获取最近N天的消息，默认1天

    Returns:
        演进结果统计
    """
    try:
        logger.info(f"收到记忆演进请求: {group_id}, days={days}")
        result = await evolve_memories(group_id, days)
        return result
    except Exception as e:
        logger.error(f"记忆演进API失败 {group_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"记忆演进失败: {str(e)}") from e


@router.get("/memory/list/{group_id}", response_model=MemoryListResponse)
async def list_group_memories(
    group_id: str,
    status: str = Query(default="active", regex="^(active|deprecated|all)$"),
    limit: int = Query(default=20, ge=1, le=100),
):
    """
    列出群组记忆

    Args:
        group_id: 群组ID
        status: 记忆状态过滤 (active/deprecated/all)
        limit: 返回数量限制

    Returns:
        记忆列表
    """
    try:
        logger.info(f"查询群组记忆列表: {group_id}, status={status}, limit={limit}")

        # 获取记忆
        memories = await get_active_memories(group_id, limit)

        # 根据status过滤
        if status == "active":
            memories = [m for m in memories if m.status == "active"]
        elif status == "deprecated":
            memories = [m for m in memories if m.status == "deprecated"]

        return MemoryListResponse(
            group_id=group_id, total=len(memories), memories=memories
        )

    except Exception as e:
        logger.error(f"查询记忆列表失败 {group_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}") from e


@router.get("/memory/search/{group_id}", response_model=MemorySearchResponse)
async def search_group_memories(
    group_id: str,
    q: str = Query(..., min_length=1, description="搜索查询文本"),
    limit: int = Query(default=5, ge=1, le=20),
    threshold: float = Query(default=0.7, ge=0.0, le=1.0),
):
    """
    语义搜索群组记忆

    Args:
        group_id: 群组ID
        q: 搜索查询文本
        limit: 返回数量限制
        threshold: 相似度阈值 (0-1)

    Returns:
        搜索结果列表
    """
    try:
        logger.info(
            f"搜索群组记忆: {group_id}, query='{q}', limit={limit}, threshold={threshold}"
        )

        results = await search_relevant_memories(group_id, q, limit, threshold)

        return MemorySearchResponse(query=q, results=results)

    except Exception as e:
        logger.error(f"搜索记忆失败 {group_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"搜索失败: {str(e)}") from e


@router.get("/memory/stats/{group_id}")
async def get_memory_stats(group_id: str):
    """
    获取群组记忆统计信息

    Args:
        group_id: 群组ID

    Returns:
        记忆统计信息
    """
    try:
        memories = await get_active_memories(group_id, limit=1000)

        active_count = sum(1 for m in memories if m.status == "active")
        deprecated_count = sum(1 for m in memories if m.status == "deprecated")

        # 计算平均版本号
        avg_version = (
            sum(m.version for m in memories) / len(memories) if memories else 0
        )

        return {
            "success": True,
            "group_id": group_id,
            "total_memories": len(memories),
            "active_memories": active_count,
            "deprecated_memories": deprecated_count,
            "avg_version": round(avg_version, 2),
        }

    except Exception as e:
        logger.error(f"获取记忆统计失败 {group_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取统计失败: {str(e)}") from e
