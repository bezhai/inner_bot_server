"""Web 搜索工具"""

import asyncio

import httpx
from langchain.tools import tool

from app.agents.tools.search.reader import read_webpage
from app.config import settings
from app.utils.decorators import dict_serialize, log_io

# 并发控制：限制同时抓取的网页数量
_FETCH_SEMAPHORE = asyncio.Semaphore(10)
_FETCH_TIMEOUT = 15  # 单个网页抓取超时（秒）


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
    num_per_query: int = 3,
) -> list[dict]:
    """批量 Google 网页搜索，支持多个查询并行执行。

    对于需要搜索多个关键词的场景，请一次性传入所有查询，工具会并行执行以提升效率。

    Args:
        queries: 搜索关键词列表，支持多个查询并行搜索。
        gl: 结果地域代码，默认 "cn"。
        hl: 界面语言代码，默认 "zh-cn"。
        num_per_query: 每个查询返回的结果条数，默认 3。

    Returns:
        搜索结果列表，每个结果包含 query, title, link, snippet, content。
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
        final_results = await asyncio.gather(*fetch_tasks)

    return list(final_results)
