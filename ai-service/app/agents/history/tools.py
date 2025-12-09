"""历史检索工具集"""

import logging
from datetime import datetime, timedelta

from langchain.tools import tool
from langgraph.runtime import get_runtime
from sqlalchemy import select

from app.agents.basic.context import ContextSchema
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
async def search_recent_messages(
    keywords: str,
    start_time: str | None = None,
    end_time: str | None = None,
    limit: int = 10,
) -> str:
    """
    搜索包含关键词的消息

    Args:
        keywords: 搜索关键词（多个关键词用空格分隔）
        start_time: 开始时间（YYYY-MM-DD HH:mm，默认最近7天）
        end_time: 结束时间（YYYY-MM-DD HH:mm，默认当前时间）
        limit: 最多返回条数（默认10）
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

            # 关键词过滤
            for kw in keywords.strip().split():
                query = query.where(ConversationMessage.content.ilike(f"%{kw}%"))

            result = await session.execute(
                query.order_by(ConversationMessage.create_time.desc()).limit(limit)
            )
            rows = result.all()

            if not rows:
                return f"未找到包含关键词 '{keywords}' 的消息"

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
        logger.error(f"search_recent_messages error: {e}", exc_info=True)
        return f"搜索失败: {e}"


@tool
async def search_user_messages(
    user_name: str,
    start_time: str | None = None,
    end_time: str | None = None,
    limit: int = 10,
) -> str:
    """
    搜索某个用户的发言

    Args:
        user_name: 用户姓名
        start_time: 开始时间（YYYY-MM-DD HH:mm，默认最近7天）
        end_time: 结束时间（YYYY-MM-DD HH:mm，默认当前时间）
        limit: 最多返回条数（默认10）
    """
    context = get_runtime(ContextSchema).context

    try:
        start_ms, end_ms = _parse_time_range(start_time, end_time)

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(ConversationMessage, LarkUser)
                .join(LarkUser, ConversationMessage.user_id == LarkUser.union_id)
                .where(
                    ConversationMessage.chat_id == context.curr_chat_id,
                    LarkUser.name == user_name,
                    ConversationMessage.create_time.between(start_ms, end_ms),
                )
                .order_by(ConversationMessage.create_time.desc())
                .limit(limit)
            )
            rows = result.all()

            if not rows:
                return f"未找到用户 '{user_name}' 的消息"

            # 格式化输出
            user_names = {user.name for _, user in rows}
            matched_names = ", ".join(user_names)

            lines = [f"{matched_names} 的消息（共{len(rows)}条）：\n"]
            for msg, user in reversed(rows):
                time_str = _format_timestamp(msg.create_time)
                content = _truncate(msg.content)
                lines.append(f"[{time_str}] {user.name}: {content}")

            return "\n".join(lines)

    except ValueError:
        return "时间格式错误，请使用 YYYY-MM-DD HH:mm"
    except Exception as e:
        logger.error(f"search_user_messages error: {e}", exc_info=True)
        return f"搜索失败: {e}"


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
