"""Web 搜索工具"""

import asyncio
from collections import defaultdict

import httpx
from langchain.tools import tool

from app.agents.tools.search.chunker import chunk_text
from app.agents.tools.search.reader import read_webpage
from app.agents.tools.search.rerank import rerank_documents
from app.config import settings
from app.utils.decorators import dict_serialize, log_io

# 并发控制
_FETCH_SEMAPHORE = asyncio.Semaphore(10)
_FETCH_TIMEOUT = 15  # 单个网页抓取超时（秒）

# 分块参数
_CHUNK_SIZE = 500
_CHUNK_OVERLAP = 50


async def _fetch_content(result: dict) -> dict:
    """为单个搜索结果抓取网页内容（带并发控制）。"""
    link = result.get("link", "")
    if not link:
        return result

    async with _FETCH_SEMAPHORE:
        try:
            content = await asyncio.wait_for(
                read_webpage(link),
                timeout=_FETCH_TIMEOUT,
            )
            result["content"] = content
        except Exception:
            # 抓取失败或超时，降级到 snippet
            result["content"] = result.get("snippet", "")

    return result


async def _search_single(
    query: str,
    client: httpx.AsyncClient,
    gl: str,
    hl: str,
    num: int,
) -> list[dict]:
    """执行单个搜索查询。"""
    url = "https://api.302.ai/serpapi/search"

    params: dict[str, str | int] = {
        "engine": "google_light",
        "api_key": settings.search_api_key or "",
        "q": query,
        "hl": hl,
        "gl": gl,
        "num": num,
    }

    response = await client.get(url, params=params)
    response.raise_for_status()
    data = response.json()

    return data.get("organic_results", [])


@tool
@log_io
@dict_serialize
async def search_web(
    queries: list[str],
    gl: str = "cn",
    hl: str = "zh-cn",
    num_per_query: int = 5,
    top_k: int = 10,
) -> list[dict]:
    """批量 Google 网页搜索，返回重排序后的高相关性结果。

    支持多个查询并行执行，结果经过分块和重排序，只返回最相关的内容。

    Args:
        queries: 搜索关键词列表，支持多个查询并行搜索。
        gl: 结果地域代码，默认 "cn"。
        hl: 界面语言代码，默认 "zh-cn"。
        num_per_query: 每个查询的搜索结果数，默认 5。
        top_k: 返回的相关文本块数量，默认 10。

    Returns:
        搜索结果列表，每个结果包含 title, link, content（相关片段）, relevance_score。
    """
    async with httpx.AsyncClient(timeout=15) as client:
        # 1. 并行执行所有搜索查询
        search_tasks = [
            _search_single(q, client, gl, hl, num_per_query) for q in queries
        ]
        all_results = await asyncio.gather(*search_tasks, return_exceptions=True)

        # 2. 合并结果，标记来源 query
        merged_results: list[dict] = []
        for i, results in enumerate(all_results):
            if isinstance(results, BaseException):
                continue
            for r in results:
                r["query"] = queries[i]
                merged_results.append(r)

        # 3. 并行抓取所有网页内容
        fetch_tasks = [_fetch_content(r) for r in merged_results]
        fetched_results = list(await asyncio.gather(*fetch_tasks))

    if not fetched_results:
        return []

    # 4. 对每个结果的内容进行分块，建立 chunk -> result 的映射
    all_chunks: list[str] = []
    chunk_to_result: list[int] = []  # chunk index -> result index

    for result_idx, result in enumerate(fetched_results):
        content = result.get("content") or result.get("snippet", "")
        chunks = chunk_text(content, chunk_size=_CHUNK_SIZE, overlap=_CHUNK_OVERLAP)

        for chunk in chunks:
            all_chunks.append(chunk)
            chunk_to_result.append(result_idx)

    if not all_chunks:
        return []

    # 5. Rerank 所有 chunks
    combined_query = " ".join(queries)

    try:
        rerank_results = await rerank_documents(combined_query, all_chunks, top_n=top_k)
    except Exception:
        # Rerank 失败，返回原始结果（截断内容）
        for r in fetched_results:
            content = r.get("content", "")
            r["content"] = content[:_CHUNK_SIZE] if content else r.get("snippet", "")
        return fetched_results[:top_k]

    # 6. 将 top-k chunks 映射回原结果，聚合相关片段
    result_chunks: dict[int, list[tuple[float, str]]] = defaultdict(list)

    for rr in rerank_results:
        chunk_idx = rr["index"]
        result_idx = chunk_to_result[chunk_idx]
        score = rr["relevance_score"]
        chunk_text_content = rr.get("document", all_chunks[chunk_idx])
        result_chunks[result_idx].append((score, chunk_text_content))

    # 7. 构建最终结果：只保留有相关 chunk 的结果
    final_results: list[dict] = []

    for result_idx, chunks_with_scores in result_chunks.items():
        result = fetched_results[result_idx]

        # 按分数排序，聚合该结果的所有相关 chunks
        chunks_with_scores.sort(key=lambda x: x[0], reverse=True)
        best_score = chunks_with_scores[0][0]
        aggregated_content = "\n\n".join(chunk for _, chunk in chunks_with_scores)

        final_results.append(
            {
                "title": result.get("title", ""),
                "link": result.get("link", ""),
                "query": result.get("query", ""),
                "content": aggregated_content,
                "relevance_score": best_score,
            }
        )

    # 按最高相关性分数排序
    final_results.sort(key=lambda x: x["relevance_score"], reverse=True)

    return final_results
