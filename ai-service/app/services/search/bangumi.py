from pydantic import BaseModel
from typing import Any, Dict, List, Optional
import httpx
import json
from app.config import settings
from app.tools import tool
from app.utils.decorators import log_io


# Pydantic 模型定义 - 返回值结构


class Images(BaseModel):
    """图片结构"""

    large: Optional[str] = None
    common: Optional[str] = None
    medium: Optional[str] = None
    small: Optional[str] = None
    grid: Optional[str] = None


class WikiInfoboxItem(BaseModel):
    """Wiki信息框项目"""

    key: str
    value: Any  # 可能是字符串或复杂对象


class SubjectRating(BaseModel):
    """条目评分信息"""

    rank: Optional[int] = None
    total: Optional[int] = None
    count: Optional[Dict[str, int]] = None  # "1": count, "2": count, etc.
    score: Optional[float] = None


class SubjectCollection(BaseModel):
    """条目收藏信息"""

    wish: Optional[int] = None
    collect: Optional[int] = None
    doing: Optional[int] = None
    on_hold: Optional[int] = None
    dropped: Optional[int] = None


class SubjectTag(BaseModel):
    """条目标签"""

    name: str
    count: int


class Subject(BaseModel):
    """条目信息"""

    id: int
    type: int
    name: str
    name_cn: Optional[str] = None
    summary: Optional[str] = None
    series: Optional[bool] = None
    nsfw: Optional[bool] = None
    locked: Optional[bool] = None
    date: Optional[str] = None  # YYYY-MM-DD格式
    platform: Optional[str] = None
    images: Optional[Images] = None
    infobox: Optional[List[WikiInfoboxItem]] = None
    volumes: Optional[int] = None
    eps: Optional[int] = None
    total_episodes: Optional[int] = None
    rating: Optional[SubjectRating] = None
    collection: Optional[SubjectCollection] = None
    meta_tags: Optional[List[str]] = None
    tags: Optional[List[SubjectTag]] = None


class SimpleSubject(BaseModel):
    """条目信息"""

    type: str
    name: str
    name_cn: Optional[str] = None
    summary: Optional[str] = None
    date: Optional[str] = None
    platform: Optional[str] = None
    infobox: Optional[List[WikiInfoboxItem]] = None
    score: Optional[float] = None  # 评分
    tags: Optional[List[str]] = None  # 标签


class SubjectSearchResult(BaseModel):
    """条目搜索结果"""

    total: int
    limit: int
    offset: int
    data: List[Subject]


class SubjectForAIResult(BaseModel):
    """条目信息"""

    total: int
    limit: int
    offset: int
    data: List[SimpleSubject]


class Character(BaseModel):
    """角色信息"""

    id: int
    name: str
    type: int
    summary: Optional[str] = None
    locked: Optional[bool] = None
    images: Optional[Images] = None
    infobox: Optional[List[WikiInfoboxItem]] = None
    gender: Optional[str] = None
    blood_type: Optional[int] = None  # 1=A, 2=B, 3=AB, 4=O
    birth_year: Optional[int] = None
    birth_mon: Optional[int] = None
    birth_day: Optional[int] = None
    stat: Optional[Dict[str, int]] = None  # comments, collects


class SimpleCharacter(BaseModel):
    """角色信息"""

    name: str
    type: str  # 角色类型, 角色, 机体, 舰船, 组织
    summary: Optional[str] = None
    infobox: Optional[List[WikiInfoboxItem]] = None
    gender: Optional[str] = None
    blood_type: Optional[int] = None  # 1=A, 2=B, 3=AB, 4=O
    birth_year: Optional[int] = None
    birth_mon: Optional[int] = None
    birth_day: Optional[int] = None


class CharacterSearchResult(BaseModel):
    """角色搜索结果"""

    total: int
    limit: int
    offset: int
    data: List[Character]


class CharacterForAIResult(BaseModel):
    """角色信息"""

    total: int
    limit: int
    offset: int
    data: List[SimpleCharacter]


async def send_bangumi_request(
    path: str,
    params: Dict[str, Any] = None,
    method: str = "GET",
    data: dict = None,
) -> Dict[str, Any]:
    """发送 Bangumi API 请求"""
    headers = {
        "Authorization": f"Bearer {settings.bangumi_access_token}",
        "Content-Type": "application/json",
        "User-Agent": "panda1234/search",  # 参考 https://github.com/bangumi/api/blob/master/docs-raw/user%20agent.md
    }

    # 构建完整的 URL
    base_url = "https://api.bgm.tv"
    url = f"{base_url}{path}"

    # 准备请求数据
    json_data = json.dumps(data) if data else None

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.request(
            method=method, url=url, params=params, content=json_data, headers=headers
        )
        response.raise_for_status()
        return response.json()


def append_element(array, element):
    if array is None:
        array = []
    # 返回拼接后的新数组，不改变原来的array
    return array + [element]


# 工具函数定义


@tool()
@log_io
async def search_subjects(
    keyword: Optional[str] = None,
    sort: str = "match",
    limit: int = 30,
    offset: int = 0,
    types: Optional[List[str]] = None,
    tags: Optional[List[str]] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    min_rating: Optional[int] = None,
    max_rating: Optional[int] = None,
) -> SubjectForAIResult:
    """
    在Bangumi上搜索ACG相关条目, 包含书籍, 动画, 音乐, 游戏, 三次元

    Args:
        keyword: 搜索关键词
        sort: 排序方式，可选值：match(匹配度)/heat(热度)/score(评分)，默认match
        limit: 分页限制，默认30，最大50, 范围比较明确时建议设置为5以下甚至1
        offset: 分页偏移，默认0
        types: 条目类型筛选，可选值包含"书籍", "动画", "音乐", "游戏", "三次元"，多值为"或"关系
        tags: 标签筛选，多值为"且"关系，可用"-"前缀排除标签
        start_date: 开始日期(包含)筛选，格式如"YYYY-MM-DD"
        end_date: 结束日期(不包含)筛选，格式如"YYYY-MM-DD"
        min_rating: 最小评分，取值范围为1-10
        max_rating: 最大评分，取值范围为1-10

    Returns:
        条目搜索结果，包含总数、分页信息和条目列表
    """
    # 构建筛选条件
    search_filter = {}
    if types is not None:
        search_filter["type"] = list(
            filter(
                lambda x: x is not None,
                [
                    {
                        "书籍": 1,
                        "动画": 2,
                        "音乐": 3,
                        "游戏": 4,
                        "三次元": 6,
                    }.get(sub_type)
                    for sub_type in types
                ],
            )
        )
    if tags is not None:
        search_filter["tag"] = tags
    if start_date is not None:
        search_filter["air_date"] = append_element(
            search_filter.get("air_date", []), f">={start_date}"
        )
    if end_date is not None:
        search_filter["air_date"] = append_element(
            search_filter.get("air_date", []), f"<{end_date}"
        )
    if min_rating is not None:
        search_filter["rating"] = append_element(
            search_filter.get("rating", []), f">={min_rating}"
        )
    if max_rating is not None:
        search_filter["rating"] = append_element(
            search_filter.get("rating", []), f"<={max_rating}"
        )

    # 构建请求体
    request_body = {"keyword": keyword, "sort": sort}
    if search_filter:
        request_body["filter"] = search_filter

    # 构建查询参数
    params = {}
    if limit != 30:
        params["limit"] = limit
    if offset != 0:
        params["offset"] = offset

    response = await send_bangumi_request(
        path="/v0/search/subjects", params=params, method="POST", data=request_body
    )
    mid_result = SubjectSearchResult(**response)
    return SubjectForAIResult(
        total=mid_result.total,
        limit=mid_result.limit,
        offset=mid_result.offset,
        data=[
            SimpleSubject(
                type={
                    1: "书籍",
                    2: "动画",
                    3: "音乐",
                    4: "游戏",
                    6: "三次元",
                }[subject.type],
                name=subject.name,
                name_cn=subject.name_cn,
                summary=subject.summary,
                date=subject.date,
                platform=subject.platform,
                infobox=subject.infobox,
                score=subject.rating.score if subject.rating else None,
                tags=[tag.name for tag in subject.tags] if subject.tags else None,
            )
            for subject in mid_result.data
        ],
    )


@tool()
@log_io
async def search_characters(
    keyword: str,
    limit: int = 30,
    offset: int = 0,
) -> CharacterSearchResult:
    """
    在Bangumi上搜索ACG相关角色

    Args:
        keyword: 搜索关键词，必填
        limit: 分页限制，默认30，最大50, 范围比较明确时建议设置为5以下甚至1
        offset: 分页偏移，默认0

    Returns:
        角色搜索结果，包含总数、分页信息和角色列表
    """

    # 构建请求体
    request_body = {"keyword": keyword}

    # 构建查询参数
    params = {}
    if limit != 30:
        params["limit"] = limit
    if offset != 0:
        params["offset"] = offset

    response = await send_bangumi_request(
        path="/v0/search/characters", params=params, method="POST", data=request_body
    )
    mid_result = CharacterSearchResult(**response)
    return CharacterForAIResult(
        total=mid_result.total,
        limit=mid_result.limit,
        offset=mid_result.offset,
        data=[
            SimpleCharacter(
                type={
                    1: "角色",
                    2: "机体",
                    3: "舰船",
                    4: "组织",
                }[character.type],
                name=character.name,
                summary=character.summary,
                infobox=character.infobox,
                gender=character.gender,
                blood_type=character.blood_type,
                birth_year=character.birth_year,
                birth_mon=character.birth_mon,
                birth_day=character.birth_day,
            )
            for character in mid_result.data
        ],
    )
