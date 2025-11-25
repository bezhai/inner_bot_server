"""
L3群组记忆服务
实现基于融合更新的群组长期记忆管理
"""

import asyncio
import json
import logging
import uuid
from datetime import datetime, timedelta
from typing import Any

from pydantic import BaseModel
from qdrant_client.http import models
from sqlalchemy import select, update

from app.agents.basic.langfuse import get_prompt
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
    """更新操作项"""

    action: str  # keep | update | create | delete
    old_id: str | None = None
    statement: str | None = None
    change_reason: str | None = None


class EvolutionOutput(BaseModel):
    """LLM结构化输出：更新操作列表"""

    items: list[EvolutionItem]


class EvolutionResult(BaseModel):
    """更新结果统计"""

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


async def embed_texts_concurrent(
    texts: list[str], max_concurrency: int = 3
) -> list[list[float]]:
    """并发文本向量化（限制并发数）

    Args:
        texts: 文本列表
        max_concurrency: 最大并发数，默认3

    Returns:
        向量列表，与输入顺序一致
    """
    if not texts:
        return []

    # 使用信号量限制并发数
    semaphore = asyncio.Semaphore(max_concurrency)

    async def embed_with_semaphore(text: str, index: int) -> tuple[int, list[float]]:
        """带信号量控制的embedding"""
        async with semaphore:
            vector = await embed_text(text)
            return index, vector

    # 并发执行所有embedding任务
    tasks = [embed_with_semaphore(text, i) for i, text in enumerate(texts)]
    results = await asyncio.gather(*tasks)

    # 按原始顺序排序结果
    sorted_results = sorted(results, key=lambda x: x[0])
    return [vector for _, vector in sorted_results]


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
    融合更新群组记忆

    核心流程：
    1. 获取现有记忆
    2. 获取新消息
    3. LLM融合更新
    4. 应用更新结果

    Args:
        group_id: 群组ID
        days: 获取最近N天的消息(如果start_time为空)
        start_time: 明确指定开始时间(用于历史回溯)
        end_time: 明确指定结束时间
        limit: 最多获取消息条数

    Returns:
        更新结果统计
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

        # Step 4: LLM融合更新（使用结构化输出）
        # 获取系统提示
        langfuse_prompt = get_prompt("memory_evolve")
        system_prompt = (
            langfuse_prompt.prompt
            if hasattr(langfuse_prompt, "prompt")
            else str(langfuse_prompt)
        )

        # 使用 OpenAIClient 进行结构化输出
        async with OpenAIClient("gemini-2.5-flash-preview-09-2025") as client:
            evolution_output = await client.structured_completion(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {
                        "role": "user",
                        "content": json.dumps(prompt_context, ensure_ascii=False),
                    },
                ],
                response_model=EvolutionOutput,
            )

        # Step 4.5: 直接获取结构化输出的更新项列表
        evolved_items = evolution_output.items

        # Step 5: 批量处理更新结果
        stats = {"kept": 0, "updated": 0, "created": 0, "deleted": 0}
        changes = []

        # 5.1 分组收集
        updates_to_process = []
        creates_to_process = []
        deletes_to_process = []

        for item in evolved_items:
            if item.action == "keep":
                stats["kept"] += 1
            elif item.action == "update":
                if item.old_id and item.statement:
                    updates_to_process.append(item)
                else:
                    logger.warning(f"update操作缺少必要字段: {item}")
            elif item.action == "create":
                if item.statement:
                    creates_to_process.append(item)
                else:
                    logger.warning(f"create操作缺少statement: {item}")
            elif item.action == "delete":
                if item.old_id:
                    deletes_to_process.append(item.old_id)
                else:
                    logger.warning(f"delete操作缺少old_id: {item}")

        # 5.2 收集需要embedding的文本
        texts_to_embed = []
        texts_to_embed.extend([item.statement for item in updates_to_process])
        texts_to_embed.extend([item.statement for item in creates_to_process])

        # 5.3 并发Embedding（并发数=3）
        if texts_to_embed:
            all_vectors = await embed_texts_concurrent(
                texts_to_embed, max_concurrency=3
            )
            update_count = len(updates_to_process)
            update_vectors = all_vectors[:update_count]
            create_vectors = all_vectors[update_count:]
        else:
            update_vectors = []
            create_vectors = []

        # 5.4 批量处理update
        if updates_to_process:
            try:
                new_ids, old_ids = await _batch_update_memories(
                    updates_to_process, update_vectors, group_id, existing_memories
                )
                stats["updated"] = len(new_ids)
                changes.extend(
                    [
                        {
                            "action": "update",
                            "old_id": item.old_id,
                            "new_statement": item.statement,
                            "change_reason": item.change_reason,
                        }
                        for item in updates_to_process
                        if item.old_id in old_ids
                    ]
                )
            except Exception as e:
                logger.error(f"批量更新记忆失败: {str(e)}")

        # 5.5 批量处理create
        if creates_to_process:
            try:
                created_ids = await _batch_create_memories(
                    creates_to_process, create_vectors, group_id
                )
                stats["created"] = len(created_ids)
                changes.extend(
                    [
                        {
                            "action": "create",
                            "statement": item.statement,
                            "change_reason": item.change_reason,
                        }
                        for item in creates_to_process
                    ]
                )
            except Exception as e:
                logger.error(f"批量创建记忆失败: {str(e)}")

        # 5.6 批量处理delete
        if deletes_to_process:
            try:
                await _batch_deprecate_memories(deletes_to_process)
                stats["deleted"] = len(deletes_to_process)
                changes.extend(
                    [
                        {
                            "action": "delete",
                            "old_id": old_id,
                            "change_reason": None,
                        }
                        for old_id in deletes_to_process
                    ]
                )
            except Exception as e:
                logger.error(f"批量删除记忆失败: {str(e)}")

        logger.info(
            f"记忆更新完成(批量优化) {group_id} | "
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
        logger.error(f"记忆更新失败 {group_id}: {error_message}")

        return EvolutionResult(
            success=False,
            group_id=group_id,
            evolution_time=evolution_time.isoformat(),
            stats={"kept": 0, "updated": 0, "created": 0, "deleted": 0},
            changes=[],
            message=f"更新失败: {error_message}",
        )


# ==================== 批量操作函数 ====================


async def _batch_create_memories(
    items: list[EvolutionItem], vectors: list[list[float]], group_id: str
) -> list[str]:
    """批量创建新记忆

    Args:
        items: 更新项列表
        vectors: 对应的向量列表
        group_id: 群组ID

    Returns:
        创建的记忆ID列表
    """
    if not items:
        return []

    now = datetime.now()
    memory_ids = [str(uuid.uuid4()) for _ in items]

    # 准备Qdrant批量数据
    payloads = [
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
        for memory_id, item in zip(memory_ids, items, strict=False)
    ]

    # 批量插入Qdrant
    await qdrant_service.upsert_vectors(
        collection="group_memories",
        vectors=vectors,
        ids=memory_ids,
        payloads=payloads,
    )

    # 批量插入数据库
    async with AsyncSessionLocal() as session:
        version_records = [
            MemoryVersion(
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
            for memory_id, item in zip(memory_ids, items, strict=False)
        ]
        session.add_all(version_records)
        await session.commit()

    logger.info(f"批量创建 {len(memory_ids)} 条记忆")
    return memory_ids


async def _batch_update_memories(
    items: list[EvolutionItem],
    vectors: list[list[float]],
    group_id: str,
    existing_memories: list[Memory],
) -> tuple[list[str], list[str]]:
    """批量更新记忆（创建新版本）

    Args:
        items: 更新项列表
        vectors: 对应的向量列表
        group_id: 群组ID
        existing_memories: 现有记忆列表

    Returns:
        (新记忆ID列表, 旧记忆ID列表)
    """
    if not items:
        return [], []

    now = datetime.now()
    memory_map = {m.memory_id: m for m in existing_memories}

    new_memory_ids = []
    old_memory_ids = []
    new_payloads = []
    new_vectors = []
    version_records = []

    for item, vec in zip(items, vectors, strict=False):
        if not item.old_id or item.old_id not in memory_map:
            logger.warning(f"未找到旧记忆ID: {item.old_id}")
            continue

        old_memory = memory_map[item.old_id]
        new_memory_id = str(uuid.uuid4())
        new_version = old_memory.version + 1

        new_memory_ids.append(new_memory_id)
        old_memory_ids.append(item.old_id)
        new_vectors.append(vec)

        # 准备Qdrant payload
        new_payloads.append(
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
                "strength": old_memory.strength * 1.1,
            }
        )

        # 准备数据库记录
        version_records.append(
            MemoryVersion(
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
        )

    if not new_memory_ids:
        return [], []

    # 批量插入新记忆到Qdrant
    await qdrant_service.upsert_vectors(
        collection="group_memories",
        vectors=new_vectors,
        ids=new_memory_ids,
        payloads=new_payloads,
    )

    # 批量插入数据库
    async with AsyncSessionLocal() as session:
        session.add_all(version_records)
        await session.commit()

    # 批量标记旧记忆
    await _batch_deprecate_memories(old_memory_ids)

    logger.info(f"批量更新 {len(new_memory_ids)} 条记忆")
    return new_memory_ids, old_memory_ids


async def _batch_deprecate_memories(memory_ids: list[str]) -> None:
    """批量标记记忆为deprecated

    Args:
        memory_ids: 记忆ID列表
    """
    if not memory_ids:
        return

    try:
        # 批量获取现有points
        results = qdrant_service.client.retrieve(
            collection_name="group_memories", ids=memory_ids, with_payload=True
        )

        # 准备批量更新的payload
        valid_ids = []
        for point in results:
            if point.payload:
                valid_ids.append(point.id)

        if not valid_ids:
            logger.warning(f"未找到任何有效的记忆ID: {memory_ids}")
            return

        # 批量更新Qdrant
        qdrant_service.client.set_payload(
            collection_name="group_memories",
            payload={"status": "deprecated"},
            points=valid_ids,
        )

        # 批量更新数据库
        now = datetime.now()
        async with AsyncSessionLocal() as session:
            await session.execute(
                update(MemoryVersion)
                .where(MemoryVersion.memory_id.in_(valid_ids))
                .where(MemoryVersion.status == "active")
                .values(status="deprecated", deprecated_at=now)
            )
            await session.commit()

        logger.info(f"批量标记 {len(valid_ids)} 条记忆为deprecated")

    except Exception as e:
        logger.error(f"批量标记记忆失败: {str(e)}")
        raise
