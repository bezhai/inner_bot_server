"""
L3群组记忆服务
实现基于融合演进的群组长期记忆管理
"""

import json
import logging
import uuid
from datetime import datetime, timedelta
from typing import Any, cast

from pydantic import BaseModel
from qdrant_client.http import models
from sqlalchemy import select

from app.agents.basic import ChatAgent
from app.agents.basic.origin_client import OpenAIClient
from app.orm.base import AsyncSessionLocal
from app.orm.models import ConversationMessage, LarkUser, MemoryVersion
from app.services.qdrant import qdrant_service
from app.services.quick_search import QuickSearchResult
from app.utils.message_formatter import format_messages_to_strings

logger = logging.getLogger(__name__)


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


class EvolutionOutput(BaseModel):
    """LLM结构化输出：演进操作列表"""

    items: list[EvolutionItem]


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


async def _get_messages_by_time_range(
    group_id: str,
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    days: int | None = None,
    limit: int = 200,
) -> tuple[list[QuickSearchResult], datetime | None, datetime | None]:
    """
    按时间范围获取消息列表

    Args:
        group_id: 群组ID
        start_time: 开始时间(优先级最高)
        end_time: 结束时间(默认为当前时间)
        days: 如果start_time为空,则从end_time往前推days天
        limit: 最多返回条数

    Returns:
        (结构化消息对象列表, 实际开始时间, 实际结束时间)
    """
    async with AsyncSessionLocal() as session:
        # 计算时间范围
        if end_time is None:
            end_time = datetime.now()

        if start_time is None:
            if days is None:
                days = 1
            start_time = end_time - timedelta(days=days)

        # 毫秒时间戳
        start_ts = int(start_time.timestamp()) * 1000
        end_ts = int(end_time.timestamp()) * 1000

        # 添加 JOIN LarkUser 获取用户名
        result = await session.execute(
            select(ConversationMessage, LarkUser.name.label("username"))
            .outerjoin(LarkUser, ConversationMessage.user_id == LarkUser.union_id)
            .where(ConversationMessage.chat_id == group_id)
            .where(ConversationMessage.create_time >= start_ts)
            .where(ConversationMessage.create_time <= end_ts)
            .order_by(ConversationMessage.create_time)
            .limit(limit)
        )
        rows = result.all()

        # 构造 QuickSearchResult 对象列表
        messages = []
        for msg, username in rows:
            messages.append(
                QuickSearchResult(
                    message_id=str(msg.message_id),
                    content=str(msg.content),
                    user_id=str(msg.user_id),
                    create_time=datetime.fromtimestamp(msg.create_time / 1000),
                    role=str(msg.role),
                    username=username if msg.role == "user" else "赤尾",
                    chat_type=str(msg.chat_type),
                    chat_name=None,  # 不需要群聊名称
                    reply_message_id=str(msg.reply_message_id)
                    if msg.reply_message_id
                    else None,
                )
            )

        logger.info(
            f"获取消息: {group_id} | {start_time} ~ {end_time} | {len(messages)}条"
        )
        return messages, start_time, end_time


async def evolve_memories(
    group_id: str,
    days: int | None = None,
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    limit: int = 200,
) -> EvolutionResult:
    """
    融合演进群组记忆

    核心流程：
    1. 获取现有记忆
    2. 获取新消息
    3. LLM融合演进
    4. 应用演进结果

    Args:
        group_id: 群组ID
        days: 获取最近N天的消息(如果start_time为空)
        start_time: 明确指定开始时间(用于历史回溯)
        end_time: 明确指定结束时间
        limit: 最多获取消息条数

    Returns:
        演进结果统计
    """
    evolution_time = datetime.now()

    try:
        # Step 1: 获取现有记忆
        existing_memories = await get_active_memories(group_id)

        # Step 2: 获取新消息(返回结构化消息对象)
        new_messages, _, _ = await _get_messages_by_time_range(
            group_id, start_time, end_time, days, limit
        )

        if not new_messages:
            return EvolutionResult(
                group_id=group_id,
                evolution_time=evolution_time.isoformat(),
                stats={"kept": 0, "updated": 0, "created": 0, "deleted": 0},
                changes=[],
                message="无新消息",
            )

        # Step 2.5: 格式化消息为字符串列表（包含时间戳、用户名、回复关系）
        formatted_messages = format_messages_to_strings(new_messages)

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
            "new_discussions": formatted_messages,
        }

        # Step 4: LLM融合演进（使用结构化输出）
        agent = ChatAgent(
            "memory_evolve",
            tools=[],
            model_id="gemini-2.5-flash-preview-09-2025",
            structured_output_schema=EvolutionOutput,
        )
        evolution_output = cast(
            EvolutionOutput,
            await agent.run_structured(
                messages=[
                    {
                        "role": "user",
                        "content": json.dumps(prompt_context, ensure_ascii=False),
                    }
                ]
            ),
        )

        # Step 4.5: 直接获取结构化输出的演进项列表
        evolved_items = evolution_output.items

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
            evolution_time=evolution_time.isoformat(),
            stats=stats,
            changes=changes,
        )

    except Exception as e:
        error_message = str(e)
        logger.error(f"记忆演进失败 {group_id}: {error_message}")

        return EvolutionResult(
            success=False,
            group_id=group_id,
            evolution_time=evolution_time.isoformat(),
            stats={"kept": 0, "updated": 0, "created": 0, "deleted": 0},
            changes=[],
            message=f"演进失败: {error_message}",
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
    now = datetime.now()

    # 向量化新陈述
    vec = await embed_text(item.statement or "")

    # 插入新记忆到Qdrant
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
                "updated_at": now.isoformat(),
                "parent_id": item.old_id,
                "change_summary": item.change_reason,
                "status": "active",
                "strength": old_memory.strength * 1.1,  # 强化
            }
        ],
    )

    # 保存新版本快照到数据库
    async with AsyncSessionLocal() as session:
        version = MemoryVersion(
            memory_id=new_memory_id,
            group_id=group_id,
            version=new_version,
            statement=item.statement or "",
            parent_id=item.old_id,
            change_summary=item.change_reason,
            status="active",
            strength=old_memory.strength * 1.1,
            created_at=now,
        )
        session.add(version)
        await session.commit()

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
    now = datetime.now()

    # 向量化陈述
    vec = await embed_text(item.statement or "")

    # 插入记忆到Qdrant
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
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
                "parent_id": None,
                "change_summary": item.change_reason,
                "status": "active",
                "strength": 0.8,
            }
        ],
    )

    # 保存版本快照到数据库
    async with AsyncSessionLocal() as session:
        version = MemoryVersion(
            memory_id=memory_id,
            group_id=group_id,
            version=1,
            statement=item.statement or "",
            parent_id=None,
            change_summary=item.change_reason,
            status="active",
            strength=0.8,
            created_at=now,
        )
        session.add(version)
        await session.commit()

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

        # 更新数据库中的版本快照
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(MemoryVersion)
                .where(MemoryVersion.memory_id == memory_id)
                .where(MemoryVersion.status == "active")
            )
            version = result.scalar_one_or_none()
            if version:
                version.status = "deprecated"
                version.deprecated_at = datetime.now()
                await session.commit()

        logger.info(f"标记记忆为deprecated: {memory_id}")

    except Exception as e:
        logger.error(f"标记记忆失败 {memory_id}: {str(e)}")
