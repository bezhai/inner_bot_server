import httpx
from langchain_core.tools import tool
from pydantic import BaseModel

from app.config import settings
from app.utils.decorators import dict_serialize, log_io


class SearchResult(BaseModel):
    need_search: bool


class AnswerBox(BaseModel):
    snippet: str | None = None
    answer: str | None = None
    answer_list: list[str] | None = None


class OrganicResult(BaseModel):
    title: str | None = None
    link: str | None = None
    snippet: str | None = None
    snippet_highlighted_words: list[str] | None = None


class KnowledgeGraph(BaseModel):
    title: str | None = None
    type: str | None = None
    description: str | None = None


class WebSearchResult(BaseModel):
    answer_box: AnswerBox | None = None
    organic_results: list[OrganicResult] | None = None
    knowledge_graph: KnowledgeGraph | None = None


@tool
@log_io
@dict_serialize
async def search_web(query: str, gl: str = "cn") -> WebSearchResult:
    """
    搜索网络上的信息，并返回结构化的搜索结果

    Args:
        query: 搜索关键词
        gl: 国家代码，默认中国
    """
    url = "https://api.302.ai/searchapi/search"

    params = {
        "q": query,
        "engine": "google",
        "api_key": settings.search_api_key,
        "hl": "zh-cn",
        "gl": gl,
    }

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
        data = response.json()

    return WebSearchResult(**data)
