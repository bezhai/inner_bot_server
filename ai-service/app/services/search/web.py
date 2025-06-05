from pydantic import BaseModel
from typing import List, Optional
import httpx
from app.config import settings
from app.tools import tool

class SearchResult(BaseModel):
    need_search: bool
    
class AnswerBox(BaseModel):
    snippet: str
    
class OrganicResult(BaseModel):
    title: str
    link: str
    snippet: str

class WebSearchResult(BaseModel):
    answer_box: Optional[AnswerBox] = None
    organic_results: List[OrganicResult]
    
@tool()
async def search_web(query: str) -> WebSearchResult:
    """
    搜索网络上的信息，并返回结构化的搜索结果
    
    Args:
        query: 搜索关键词
        
    Returns:
        搜索结果
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