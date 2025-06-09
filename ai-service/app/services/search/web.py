from pydantic import BaseModel
from typing import List, Optional
import httpx
from app.config import settings
from app.tools import tool
from app.utils.decorators import log_io


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
    

class KnowledgeGraph(BaseModel):
    title: Optional[str] = None
    type: Optional[str] = None
    description: Optional[str] = None

class WebSearchResult(BaseModel):
    answer_box: Optional[AnswerBox] = None
    organic_results: Optional[List[OrganicResult]] = None
    knowledge_graph: Optional[KnowledgeGraph] = None


@tool()
@log_io
async def search_web(query: str, gl: str = "cn") -> WebSearchResult:
    """
    搜索网络上的信息，并返回结构化的搜索结果

    Args:
        query: 搜索关键词
        gl: 国家代码，默认中国
    """
    url = "https://api.302.ai/searchapi/search"

    query = {
        "q": query,
        "engine": "google",
        "api_key": settings.search_api_key,
        "hl": "zh-cn",
        "gl": gl,
    }

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(url, params=query)
        response.raise_for_status()
        data = response.json()

    return WebSearchResult(**data)
