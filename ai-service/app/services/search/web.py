from pydantic import BaseModel
from typing import List, Optional
import httpx
from app.config import settings
from app.tools import tool
from app.utils.log_decorator import log_io


class SearchResult(BaseModel):
    need_search: bool


class AnswerBox(BaseModel):
    snippet: Optional[str] = None
    answer: Optional[str] = None
    answer_list: Optional[List[str]] = None


class OrganicResult(BaseModel):
    title: Optional[str] = None
    link: Optional[str] = None
    snippet: Optional[str] = None
    snippet_highlighted_words: Optional[List[str]] = None


class WebSearchResult(BaseModel):
    answer_box: Optional[AnswerBox] = None
    organic_results: Optional[List[OrganicResult]] = None


@tool()
@log_io
async def search_web(query: str) -> WebSearchResult:
    """
    搜索网络上的信息，并返回结构化的搜索结果

    Args:
        query: 搜索关键词
    """
    url = "https://api.302.ai/searchapi/search"

    query = {
        "q": query,
        "engine": "google",
        "api_key": settings.search_api_key,
        "hl": "zh-cn",
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(url, params=query)
        response.raise_for_status()
        data = response.json()

    return WebSearchResult(**data)
