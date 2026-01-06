"""历史检索工具集"""

import logging
from datetime import datetime, timedelta

from langchain.tools import tool
from langgraph.runtime import get_runtime
from sqlalchemy import select

from app.agents.basic.context import ContextSchema
from app.agents.basic.origin_client import OpenAIClient
from app.orm.base import AsyncSessionLocal
from app.orm.models import ConversationMessage, LarkGroupMember, LarkUser, UserProfile

logger = logging.getLogger(__name__)


def _format_timestamp(ts: int) -> str:
    """格式化时间戳"""
    return datetime.fromtimestamp(ts / 1000).strftime("%Y-%m-%d %H:%M")


def _parse_time_range(start_time: str | None, end_time: str | None) -> tuple[int, int]:
    """解析时间范围，返回毫秒时间戳"""
    now = datetime.now()
    end_ms = (
        int(datetime.strptime(end_time, "%Y-%m-%d %H:%M").timestamp() * 1000)
        if end_time
        else int(now.timestamp() * 1000)
    )
    start_ms = (
        int(datetime.strptime(start_time, "%Y-%m-%d %H:%M").timestamp() * 1000)
        if start_time
        else int((now - timedelta(days=7)).timestamp() * 1000)
    )
    return start_ms, end_ms


def _truncate(text: str, max_len: int = 100) -> str:
    """截断并清理文本"""
    text = " ".join(text.split())  # 清理所有空白字符
    return f"{text[:max_len]}..." if len(text) > max_len else text


@tool
async def search_messages(
    start_time: str | None = None,
    end_time: str | None = None,
    keywords: str | None = None,
    user_name: str | None = None,
    limit: int = 500,
) -> str:
    """
    搜索本群内消息

    Args:
        start_time: 开始时间（YYYY-MM-DD HH:mm，默认最近7天）
        end_time: 结束时间（YYYY-MM-DD HH:mm，默认当前时间）
        keywords: 关键词（可选，多个用空格分隔）
        user_name: 指定用户姓名（可选）
        limit: 限制返回条数（默认500），请根据任务需求自行调节
    """
    context = get_runtime(ContextSchema).context

    try:
        start_ms, end_ms = _parse_time_range(start_time, end_time)

        async with AsyncSessionLocal() as session:
            query = (
                select(ConversationMessage, LarkUser)
                .join(LarkUser, ConversationMessage.user_id == LarkUser.union_id)
                .where(
                    ConversationMessage.chat_id == context.curr_chat_id,
                    ConversationMessage.create_time.between(start_ms, end_ms),
                )
            )

            # 关键词过滤（可选）
            if keywords:
                for kw in keywords.strip().split():
                    query = query.where(ConversationMessage.content.ilike(f"%{kw}%"))

            # 用户过滤（可选）
            if user_name:
                query = query.where(LarkUser.name == user_name)

            result = await session.execute(
                query.order_by(ConversationMessage.create_time.desc()).limit(limit)
            )
            rows = result.all()

            if not rows:
                return "未找到相关消息"

            # 格式化输出
            lines = [f"找到 {len(rows)} 条消息：\n"]
            for msg, user in reversed(rows):  # 时间正序
                time_str = _format_timestamp(msg.create_time)
                content = _truncate(msg.content)
                lines.append(f"[{time_str}] {user.name}: {content}")

            return "\n".join(lines)

    except ValueError:
        return "时间格式错误，请使用 YYYY-MM-DD HH:mm"
    except Exception as e:
        logger.error(f"search_messages error: {e}", exc_info=True)
        return f"搜索失败: {e}"


@tool
async def search_messages_semantic(
    query: str,
    limit: int = 10,
) -> str:
    """
    语义化搜索本群内消息（支持图片内容检索）

    使用多模态向量检索，能够：
    - 理解同义词和语义相关性（如"bug"="问题"="错误"）
    - 搜索图片中的视觉内容（如"蓝色的架构图""那个报错截图"）
    - 跨模态匹配（用文字描述匹配图片内容）

    适用场景：
    - 用模糊描述查找消息（如"上次那个讨论""关于性能的那次"）
    - 查找图片相关消息（如"那张设计稿""数据库架构图"）
    - 同义词匹配（如搜"故障"能找到"bug""问题""错误"）

    Args:
        query: 自然语言查询描述
        limit: 返回结果数量（默认10条）

    Returns:
        str: 格式化的搜索结果

    Examples:
        - "上周那张数据库设计图"
        - "关于Redis缓存的讨论"
        - "那个报错截图"
        - "性能优化的方案"
    """
    context = get_runtime(ContextSchema).context

    try:
        # 1. 生成查询向量（Query侧）
        async with OpenAIClient("doubao:doubao-embedding-vision-251215") as client:
            query_vector = await client.embed_multimodal_for_query(query, [])

        # 2. 从 messages_recall 检索
        from app.services.qdrant import qdrant_service

        results = await qdrant_service.search_vectors(
            collection_name="messages_recall",
            query_vector=query_vector,
            limit=limit * 3,  # 多取一些，然后过滤chat_id
        )

        if not results:
            return "未找到相关消息"

        # 3. 过滤当前chat_id的结果
        filtered_results = [
            r
            for r in results
            if r.get("payload", {}).get("chat_id") == context.curr_chat_id
        ]

        if not filtered_results:
            return "在本群内未找到相关消息"

        # 4. 获取完整消息内容
        message_ids = [r["payload"]["message_id"] for r in filtered_results[:limit]]

        async with AsyncSessionLocal() as session:
            query_obj = (
                select(ConversationMessage, LarkUser)
                .join(LarkUser, ConversationMessage.user_id == LarkUser.union_id)
                .where(ConversationMessage.message_id.in_(message_ids))
            )
            result = await session.execute(query_obj)
            rows = result.all()

        if not rows:
            return "未找到相关消息"

        # 5. 按原始相似度排序并格式化输出
        message_map = {msg.message_id: (msg, user) for msg, user in rows}
        sorted_messages = [
            message_map[mid] for mid in message_ids if mid in message_map
        ]

        lines = [f"找到 {len(sorted_messages)} 条相关消息：\n"]
        for msg, user in sorted_messages:
            time_str = _format_timestamp(msg.create_time)
            content = _truncate(msg.content)
            lines.append(f"[{time_str}] {user.name}: {content}")

        return "\n".join(lines)

    except Exception as e:
        logger.error(f"search_messages_semantic error: {e}", exc_info=True)
        return f"语义搜索失败: {e}"


@tool
async def list_group_members(role: str | None = None) -> str:
    """
    列出群成员列表

    Args:
        role: 筛选角色（可选）
            - "owner": 群主
            - "manager": 管理员
            - None: 所有成员
    """
    context = get_runtime(ContextSchema).context

    try:
        async with AsyncSessionLocal() as session:
            query = (
                select(LarkGroupMember, LarkUser, UserProfile)
                .join(LarkUser, LarkGroupMember.union_id == LarkUser.union_id)
                .outerjoin(UserProfile, LarkUser.union_id == UserProfile.user_id)
                .where(
                    LarkGroupMember.chat_id == context.curr_chat_id,
                    ~LarkGroupMember.is_leave,
                )
            )

            if role == "owner":
                query = query.where(LarkGroupMember.is_owner)
            elif role == "manager":
                query = query.where(LarkGroupMember.is_manager)

            result = await session.execute(query)
            rows = result.all()

            if not rows:
                return "群内无成员" if not role else f"未找到 {role} 角色的成员"

            # 格式化输出
            lines = [f"群成员列表（共{len(rows)}人）：\n"]
            for member, user, profile in rows:
                role_tag = (
                    " [群主]"
                    if member.is_owner
                    else " [管理员]"
                    if member.is_manager
                    else ""
                )
                profile_text = (
                    f" - {_truncate(profile.profile, 80)}"
                    if profile and profile.profile
                    else ""
                )
                lines.append(f"• {user.name}{role_tag}{profile_text}")

            return "\n".join(lines)

    except Exception as e:
        logger.error(f"list_group_members error: {e}", exc_info=True)
        return f"查询失败: {e}"
