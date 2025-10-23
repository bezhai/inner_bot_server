import logging
from typing import Any

from sqlalchemy import select

from app.orm.base import AsyncSessionLocal
from app.orm.crud import get_topics_by_group, upsert_topic
from app.orm.models import ConversationMessage, LarkUser, TopicMemory

logger = logging.getLogger(__name__)


async def get_active_topics(group_id: str, hours: int = 3) -> list[TopicMemory]:
    """获取最近活跃的话题（基于updated_at字段）"""
    return await get_topics_by_group(group_id, hours=hours)


async def get_messages_by_ids(message_ids: list[str]) -> list[ConversationMessage]:
    """根据message_id列表查询消息"""
    if not message_ids:
        return []
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(ConversationMessage, LarkUser.name.label("username"))
            .outerjoin(LarkUser, ConversationMessage.user_id == LarkUser.union_id)
            .where(ConversationMessage.message_id.in_(message_ids))
            .order_by(ConversationMessage.create_time)
        )
        rows = result.all()
        return [(row[0], row[1]) for row in rows]


def build_topic_rewrite_prompt(
    active_topics: list[TopicMemory], new_messages_slice: list[str]
) -> list[dict[str, Any]]:
    system = {
        "role": "system",
        "content": (
            "You are a topic memory maintainer. Rewrite rolling topics for the group.\n"
            "- Keep stable topic IDs when possible.\n"
            "- Update titles and concise summaries to reflect recent messages.\n"
            "- Return JSON lines with fields: id (optional), title, summary."
        ),
    }
    topics_text = "\n".join([f"[{t.id}] {t.title}: {t.summary}" for t in active_topics])
    messages_text = "\n".join(new_messages_slice)
    user = {
        "role": "user",
        "content": f"Current active topics:\n{topics_text}\n\nRecent messages:\n{messages_text}",
    }
    return [system, user]


async def update_topic_memory(group_id: str, new_messages_slice: list[str]) -> None:
    try:
        active = await get_active_topics(group_id)
        prompt = build_topic_rewrite_prompt(active, new_messages_slice)

        from app.agents.basic import ChatAgent

        agent = ChatAgent(
            "upsert_group_topic", tools=[], model_id="gemini-2.5-flash-preview-09-2025"
        )
        result = await agent.run(messages=prompt)
        text = result.content or ""

        # 简单解析：每行一个JSON或以分隔符分割；此处保持健壮性，失败即跳过
        import json

        lines = [line for line in text.splitlines() if line.strip()]
        for line in lines:
            try:
                obj = json.loads(line)
            except Exception:
                continue
            topic_id = obj.get("id")
            title = obj.get("title")
            summary = obj.get("summary")
            if not title or not summary:
                continue
            await upsert_topic(
                topic_id=int(topic_id) if topic_id is not None else None,
                group_id=group_id,
                title=title,
                summary=summary,
            )
    except Exception as e:
        logger.error(f"update_topic_memory error: {str(e)}")
