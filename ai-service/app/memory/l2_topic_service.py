import logging
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select, desc

from app.orm.base import AsyncSessionLocal
from app.orm.models import ConversationMessage, TopicMemory
from app.orm.crud import get_topics_by_group, upsert_topic

logger = logging.getLogger(__name__)


async def get_active_topics(group_id: str, hours: int = 3) -> list[TopicMemory]:
    topics = await get_topics_by_group(group_id)
    cutoff = datetime.now() - timedelta(hours=hours)
    return [t for t in topics if t.updated_at >= cutoff]


async def get_latest_messages_for_chat(
    chat_id: str, *, limit: int = 30, minutes: int = 30
) -> list[ConversationMessage]:
    async with AsyncSessionLocal() as session:
        cutoff = int((datetime.now() - timedelta(minutes=minutes)).timestamp())
        result = await session.execute(
            select(ConversationMessage)
            .where(ConversationMessage.chat_id == chat_id)
            .where(ConversationMessage.create_time >= cutoff)
            .order_by(desc(ConversationMessage.create_time))
            .limit(limit)
        )
        rows = list(result.scalars().all())
        rows.reverse()
        return rows


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
    topics_text = "\n".join(
        [f"[{t.id}] {t.title}: {t.summary}" for t in active_topics]
    )
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

        # 此处调用已有模型构建与OpenAI封装，保持解耦
        from app.agents.basic.origin_client import OpenAIClient
        client = OpenAIClient("302.ai:gpt-4o-mini")
        async with client:
            completion = await client.chat_completion(messages=prompt, temperature=0.3)
        text = completion.choices[0].message.content or ""

        # 简单解析：每行一个JSON或以分隔符分割；此处保持健壮性，失败即跳过
        import json

        lines = [l for l in text.splitlines() if l.strip()]
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

