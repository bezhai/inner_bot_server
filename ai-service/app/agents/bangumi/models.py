from pydantic import BaseModel
from typing import Any, Dict, List, Optional


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

    def to_simple(self) -> "SimpleSubject":
        return SimpleSubject(
            id=self.id,
            type={
                1: "书籍",
                2: "动画",
                3: "音乐",
                4: "游戏",
                6: "三次元",
            }[self.type],
            name=self.name,
            name_cn=self.name_cn,
            summary=self.summary,
            date=self.date,
            platform=self.platform,
            infobox=self.infobox,
            score=self.rating.score if self.rating else None,
            tags=[tag.name for tag in self.tags] if self.tags else None,
        )


class SimpleSubject(BaseModel):
    """条目信息"""

    id: int
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

    def to_simple(self) -> "SimpleCharacter":

        return SimpleCharacter(
            id=self.id,
            name=self.name,
            type={
                1: "角色",
                2: "机体",
                3: "舰船",
                4: "组织",
            }[self.type],
            summary=self.summary,
            infobox=self.infobox,
            gender=self.gender,
            blood_type=self.blood_type,
            birth_year=self.birth_year,
            birth_mon=self.birth_mon,
            birth_day=self.birth_day,
        )


class SimpleCharacter(BaseModel):
    """角色信息"""

    id: int
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
