"""Jina Rerank - 文档重排序"""

import httpx

from app.config import settings

_RERANK_MODEL = "jina-reranker-v2-base-multilingual"


async def rerank_documents(
    query: str,
    documents: list[str],
    top_n: int = 5,
) -> list[dict]:
    """使用 Jina Reranker 对文档进行相关性重排序。

    Args:
        query: 查询文本。
        documents: 待排序的文档列表。
        top_n: 返回的文档数量。

    Returns:
        重排序后的结果列表，每个包含 index, relevance_score, document。
    """
    if not documents:
        return []

    url = "https://api.302.ai/v1/rerank"

    headers = {}
    if settings.search_api_key:
        headers["Authorization"] = f"Bearer {settings.search_api_key}"

    payload = {
        "model": _RERANK_MODEL,
        "query": query,
        "documents": documents,
        "top_n": min(top_n, len(documents)),
    }

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(url, headers=headers, json=payload)
        response.raise_for_status()
        data = response.json()

    return data.get("results", [])
