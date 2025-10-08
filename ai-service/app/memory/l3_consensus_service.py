import logging
import uuid
from datetime import datetime, timedelta
from typing import List

from sqlalchemy import select, desc

from app.memory.embedding import EmbeddingClient
from app.orm.base import AsyncSessionLocal
from app.orm.models import ConversationMessage
from app.services.qdrant import qdrant_service

logger = logging.getLogger(__name__)


async def embed_text(text: str) -> List[float]:
    async with EmbeddingClient() as ec:
        return await ec.embed(text)


async def search_relevant_consensus(group_id: str, query: str, k: int = 3) -> list[str]:
    vec = await embed_text(query)
    results = await qdrant_service.search_vectors("consensus", vec, limit=k)
    # 仅过滤同组（payload 可能为空，做健壮处理）
    statements: list[str] = []
    for r in results:
        payload = r.get("payload") or {}
        if payload.get("group_id") == group_id:
            stmt = payload.get("statement")
            if stmt:
                statements.append(stmt)
    return statements[:k]


async def _get_recent_messages_text(group_id: str, days: int = 1) -> str:
    async with AsyncSessionLocal() as session:
        since_ts = int((datetime.now() - timedelta(days=days)).timestamp())
        result = await session.execute(
            select(ConversationMessage)
            .where(ConversationMessage.chat_id == group_id)
            .where(ConversationMessage.create_time >= since_ts)
            .order_by(desc(ConversationMessage.create_time))
            .limit(200)
        )
        rows = list(result.scalars().all())
        rows.reverse()
        texts = []
        for m in rows:
            prefix = "User" if m.role == "user" else "Assistant"
            texts.append(f"{prefix}: {m.content}")
        return "\n".join(texts)


async def distill_consensus_daily(group_id: str) -> None:
    try:
        source = await _get_recent_messages_text(group_id, days=1)
        if not source:
            return
        # 指令 LLM 提炼共识
        from app.agents.basic.origin_client import OpenAIClient

        messages = [
            {
                "role": "system",
                "content": (
                    "Extract stable group consensus statements from the material.\n"
                    "Return one statement per line. Avoid trivial or time-sensitive facts."
                ),
            },
            {"role": "user", "content": source},
        ]
        client = OpenAIClient("302.ai:gpt-4o-mini")
        async with client:
            completion = await client.chat_completion(messages=messages, temperature=0.2)
        text = completion.choices[0].message.content or ""
        lines = [l.strip(" -") for l in text.splitlines() if l.strip()]
        for stmt in lines:
            try:
                vec = await embed_text(stmt)
                await qdrant_service.upsert_vectors(
                    collection="consensus",
                    vectors=[vec],
                    ids=[str(uuid.uuid4())],
                    payloads=[
                        {
                            "consensus_id": str(uuid.uuid4()),
                            "group_id": group_id,
                            "statement": stmt,
                            "created_at": datetime.now().isoformat(),
                        }
                    ],
                )
            except Exception as e:
                logger.warning(f"embed/upsert failed for statement: {e}")
    except Exception as e:
        logger.error(f"distill_consensus_daily error: {str(e)}")

