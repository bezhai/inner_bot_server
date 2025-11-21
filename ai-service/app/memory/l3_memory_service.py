"""
L3群组记忆服务
实现基于融合演进的群组长期记忆管理
"""

import json
import logging
import uuid
from datetime import datetime, timedelta
from typing import Any

from pydantic import BaseModel
from qdrant_client.http import models
from sqlalchemy import desc, select

from app.agents.basic import ChatAgent
from app.agents.basic.origin_client import OpenAIClient
from app.orm.base import AsyncSessionLocal
from app.orm.models import ConversationMessage
from app.services.qdrant import qdrant_service

logger = logging.getLogger(__name__)

try:
    from json_repair import repair_json

    HAS_JSON_REPAIR = True
except ImportError:
    HAS_JSON_REPAIR = False
    logger.warning("json_repair未安装，JSON容错功能将降级")


# ==================== 数据模型 ====================


class Memory(BaseModel):
    """群组记忆模型"""

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


class EvolutionItem(BaseModel):
    """演进操作项"""

    action: str  # keep | update | create | delete
    old_id: str | None = None
    statement: str | None = None
    change_reason: str | None = None


class EvolutionResult(BaseModel):
    """演进结果统计"""

    success: bool = True
    group_id: str
    evolution_time: str
    stats: dict[str, int]
    changes: list[dict[str, Any]]
    message: str | None = None


# ==================== 核心函数 ====================


async def embed_text(text: str) -> list[float]:
    """文本向量化"""
    async with OpenAIClient("text-embedding-3-small") as ec:
        return await ec.embed(text)


async def get_active_memories(group_id: str, limit: int = 100) -> list[Memory]:
    """
    获取群组的活跃记忆列表

    Args:
        group_id: 群组ID
        limit: 返回数量限制

    Returns:
        记忆对象列表
    """
    try:
        # 从Qdrant获取所有active状态的记忆
        results = qdrant_service.client.scroll(
            collection_name="group_memories",
            scroll_filter=models.Filter(
                must=[
                    models.FieldCondition(
                        key="group_id", match=models.MatchValue(value=group_id)
                    ),
                    models.FieldCondition(
                        key="status", match=models.MatchValue(value="active")
                    ),
                ]
            ),
            limit=limit,
            with_payload=True,
            with_vectors=False,
        )

        memories = []
        for point in results[0]:
            payload = point.payload
            if not payload:
                continue

            memories.append(
                Memory(
                    memory_id=payload.get("memory_id", str(point.id)),
                    group_id=payload.get("group_id", ""),
                    statement=payload.get("statement", ""),
                    version=payload.get("version", 1),
                    created_at=payload.get("created_at", ""),
                    updated_at=payload.get("updated_at", ""),
                    parent_id=payload.get("parent_id"),
                    change_summary=payload.get("change_summary"),
                    status=payload.get("status", "active"),
                    strength=payload.get("strength", 0.8),
                )
            )

        logger.info(f"获取到 {len(memories)} 条活跃记忆: {group_id}")
        return memories

    except Exception as e:
        logger.error(f"获取活跃记忆失败 {group_id}: {str(e)}")
        return []


async def search_relevant_memories(
    group_id: str, query: str, k: int = 3, threshold: float = 0.7
) -> list[dict[str, Any]]:
    """
    语义搜索相关记忆

    Args:
        group_id: 群组ID
        query: 查询文本
        k: 返回数量
        threshold: 相似度阈值

    Returns:
        记忆搜索结果列表
    """
    vec = await embed_text(query)
    results = await qdrant_service.search_vectors("group_memories", vec, limit=k * 2)

    # 过滤同组且score>=threshold的结果
    filtered = []
    for r in results:
        payload = r.get("payload") or {}
        score = r.get("score", 0)
        if payload.get("group_id") == group_id and score >= threshold:
            filtered.append(
                {
                    "memory_id": payload.get("memory_id"),
                    "statement": payload.get("statement"),
                    "score": score,
                    "version": payload.get("version", 1),
                    "updated_at": payload.get("updated_at"),
                }
            )

    return filtered[:k]


async def _get_recent_messages(
    group_id: str, days: int = 1, limit: int = 200
) -> list[str]:
    """
    获取最近N天的消息列表

    Args:
        group_id: 群组ID
        days: 天数
        limit: 最多返回条数

    Returns:
        消息文本列表
    """
    async with AsyncSessionLocal() as session:
        since_ts = int((datetime.now() - timedelta(days=days)).timestamp())
        result = await session.execute(
            select(ConversationMessage)
            .where(ConversationMessage.chat_id == group_id)
            .where(ConversationMessage.create_time >= since_ts)
            .order_by(desc(ConversationMessage.create_time))
            .limit(limit)
        )
        rows = list(result.scalars().all())
        rows.reverse()

        messages = []
        for m in rows:
            prefix = "User" if m.role == "user" else "Assistant"
            messages.append(f"{prefix}: {m.content}")

        return messages


def parse_evolution_result_robust(llm_output: str) -> list[EvolutionItem]:
    """
    健壮地解析LLM输出的JSON Lines

    容错策略：
    1. 尝试直接解析每行JSON
    2. 如果失败，使用json_repair修复后再解析
    3. 如果仍失败，记录错误并跳过该行

    Args:
        llm_output: LLM原始输出文本

    Returns:
        成功解析的演进项列表
    """
    items = []
    lines = [line.strip() for line in llm_output.splitlines() if line.strip()]

    for i, line in enumerate(lines, 1):
        # 跳过非JSON行（如markdown代码块标记、注释行）
        if line.startswith("```") or line.startswith("#") or line.startswith("//"):
            continue

        try:
            # 尝试1: 直接解析
            obj = json.loads(line)
            items.append(EvolutionItem(**obj))
        except json.JSONDecodeError as e:
            if HAS_JSON_REPAIR:
                try:
                    # 尝试2: 使用json_repair修复后解析
                    logger.warning(f"第{i}行JSON格式错误，尝试修复: {line[:50]}...")
                    repaired = repair_json(line)
                    obj = json.loads(repaired)
                    items.append(EvolutionItem(**obj))
                    logger.info(f"第{i}行JSON修复成功")
                except Exception as repair_error:
                    # 尝试3: 实在无法解析，记录详细错误并跳过
                    logger.error(
                        f"第{i}行JSON解析最终失败，已跳过 | "
                        f"原始: {line[:100]}... | "
                        f"原始错误: {e} | "
                        f"修复错误: {repair_error}"
                    )
                    continue
            else:
                # 没有json_repair，直接跳过
                logger.error(
                    f"第{i}行JSON解析失败，已跳过 | 原始: {line[:100]}... | 错误: {e}"
                )
                continue

    if not items:
        logger.warning("未能解析任何有效的演进项，可能LLM输出格式完全错误")
    else:
        logger.info(f"成功解析 {len(items)}/{len(lines)} 条演进项")

    return items


async def evolve_memories(group_id: str, days: int = 1) -> EvolutionResult:
    """
    融合演进群组记忆

    核心流程：
    1. 获取现有记忆
    2. 获取新消息
    3. LLM融合演进
    4. 应用演进结果

    Args:
        group_id: 群组ID
        days: 获取最近N天的消息

    Returns:
        演进结果统计
    """
    evolution_time = datetime.now().isoformat()

    try:
        # Step 1: 获取现有记忆
        existing_memories = await get_active_memories(group_id)

        # Step 2: 获取新消息
        new_messages = await _get_recent_messages(group_id, days)
        if not new_messages:
            return EvolutionResult(
                group_id=group_id,
                evolution_time=evolution_time,
                stats={"kept": 0, "updated": 0, "created": 0, "deleted": 0},
                changes=[],
                message="无新消息",
            )

        # Step 3: 构建LLM输入
        prompt_context = {
            "existing_memories": [
                {
                    "id": m.memory_id,
                    "statement": m.statement,
                    "version": m.version,
                    "created_at": m.created_at,
                    "updated_at": m.updated_at,
                }
                for m in existing_memories
            ],
            "new_discussions": new_messages[:200],  # 限制消息数量
        }

        # Step 4: LLM融合演进
        agent = ChatAgent(
            "memory_evolve", tools=[], model_id="gemini-2.5-flash-preview-09-2025"
        )
        result = await agent.run(
            messages=[
                {
                    "role": "user",
                    "content": json.dumps(prompt_context, ensure_ascii=False),
                }
            ]
        )

        # Step 4.5: 健壮的JSON解析
        content = (
            result.content if isinstance(result.content, str) else str(result.content)
        )
        evolved_items = parse_evolution_result_robust(content)

        # Step 5: 应用演进结果
        stats = {"kept": 0, "updated": 0, "created": 0, "deleted": 0}
        changes = []

        for item in evolved_items:
            try:
                if item.action == "keep":
                    stats["kept"] += 1

                elif item.action == "update":
                    if not item.old_id or not item.statement:
                        logger.warning(f"update操作缺少必要字段: {item}")
                        continue
                    await _update_memory(item, group_id, existing_memories)
                    stats["updated"] += 1
                    changes.append(
                        {
                            "action": "update",
                            "old_id": item.old_id,
                            "new_statement": item.statement,
                            "change_reason": item.change_reason,
                        }
                    )

                elif item.action == "create":
                    if not item.statement:
                        logger.warning(f"create操作缺少statement: {item}")
                        continue
                    await _create_memory(item, group_id)
                    stats["created"] += 1
                    changes.append(
                        {
                            "action": "create",
                            "statement": item.statement,
                            "change_reason": item.change_reason,
                        }
                    )

                elif item.action == "delete":
                    if not item.old_id:
                        logger.warning(f"delete操作缺少old_id: {item}")
                        continue
                    await _deprecate_memory(item.old_id)
                    stats["deleted"] += 1
                    changes.append(
                        {
                            "action": "delete",
                            "old_id": item.old_id,
                            "change_reason": item.change_reason,
                        }
                    )

            except Exception as e:
                logger.error(f"处理演进项失败: {item} | 错误: {str(e)}")
                continue

        logger.info(
            f"记忆演进完成 {group_id} | "
            f"kept={stats['kept']}, updated={stats['updated']}, "
            f"created={stats['created']}, deleted={stats['deleted']}"
        )

        return EvolutionResult(
            group_id=group_id,
            evolution_time=evolution_time,
            stats=stats,
            changes=changes,
        )

    except Exception as e:
        logger.error(f"记忆演进失败 {group_id}: {str(e)}")
        return EvolutionResult(
            success=False,
            group_id=group_id,
            evolution_time=evolution_time,
            stats={"kept": 0, "updated": 0, "created": 0, "deleted": 0},
            changes=[],
            message=f"演进失败: {str(e)}",
        )


async def _update_memory(
    item: EvolutionItem, group_id: str, existing_memories: list[Memory]
) -> None:
    """
    更新记忆（创建新版本）

    Args:
        item: 演进项
        group_id: 群组ID
        existing_memories: 现有记忆列表
    """
    # 查找旧记忆
    old_memory = next(
        (m for m in existing_memories if m.memory_id == item.old_id), None
    )
    if not old_memory:
        logger.warning(f"未找到旧记忆ID: {item.old_id}")
        return

    # 生成新记忆
    new_memory_id = str(uuid.uuid4())
    new_version = old_memory.version + 1
    now = datetime.now().isoformat()

    # 向量化新陈述
    vec = await embed_text(item.statement or "")

    # 插入新记忆
    await qdrant_service.upsert_vectors(
        collection="group_memories",
        vectors=[vec],
        ids=[new_memory_id],
        payloads=[
            {
                "memory_id": new_memory_id,
                "group_id": group_id,
                "statement": item.statement,
                "version": new_version,
                "created_at": old_memory.created_at,
                "updated_at": now,
                "parent_id": item.old_id,
                "change_summary": item.change_reason,
                "status": "active",
                "strength": old_memory.strength * 1.1,  # 强化
            }
        ],
    )

    # 标记旧记忆为deprecated
    if item.old_id:
        await _deprecate_memory(item.old_id)

    logger.info(f"更新记忆: {item.old_id} -> {new_memory_id} (v{new_version})")


async def _create_memory(item: EvolutionItem, group_id: str) -> None:
    """
    创建新记忆

    Args:
        item: 演进项
        group_id: 群组ID
    """
    memory_id = str(uuid.uuid4())
    now = datetime.now().isoformat()

    # 向量化陈述
    vec = await embed_text(item.statement or "")

    # 插入记忆
    await qdrant_service.upsert_vectors(
        collection="group_memories",
        vectors=[vec],
        ids=[memory_id],
        payloads=[
            {
                "memory_id": memory_id,
                "group_id": group_id,
                "statement": item.statement,
                "version": 1,
                "created_at": now,
                "updated_at": now,
                "parent_id": None,
                "change_summary": item.change_reason,
                "status": "active",
                "strength": 0.8,
            }
        ],
    )

    logger.info(f"创建新记忆: {memory_id}")


async def _deprecate_memory(memory_id: str) -> None:
    """
    标记记忆为deprecated

    Args:
        memory_id: 记忆ID
    """
    try:
        # 获取现有point
        results = qdrant_service.client.retrieve(
            collection_name="group_memories", ids=[memory_id], with_payload=True
        )

        if not results:
            logger.warning(f"未找到记忆ID: {memory_id}")
            return

        # 更新status为deprecated
        payload = results[0].payload
        if not payload:
            logger.warning(f"记忆{memory_id}的payload为空")
            return

        payload["status"] = "deprecated"

        # 重新upsert（Qdrant没有直接的update payload API）
        qdrant_service.client.set_payload(
            collection_name="group_memories", payload=payload, points=[memory_id]
        )

        logger.info(f"标记记忆为deprecated: {memory_id}")

    except Exception as e:
        logger.error(f"标记记忆失败 {memory_id}: {str(e)}")


# ==================== 兼容旧代码的函数 ====================


async def distill_consensus_daily(group_id: str) -> None:
    """
    旧版共识提炼函数（保持兼容性）
    现在调用新的evolve_memories
    """
    logger.warning("distill_consensus_daily已废弃，请使用evolve_memories")
    await evolve_memories(group_id, days=1)
