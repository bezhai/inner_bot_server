from pydantic import BaseModel
from typing import Any, Dict, List, Optional
from enum import Enum


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
    

class SubjectType(int, Enum):
    """条目类型"""
    
    BOOK = 1
    ANIME = 2
    MUSIC = 3
    GAME = 4
    THIRD_PARTY = 6
    
    def to_str(self) -> str:
        return {
            SubjectType.BOOK: "书籍",
            SubjectType.ANIME: "动画",
            SubjectType.MUSIC: "音乐",
            SubjectType.GAME: "游戏",
            SubjectType.THIRD_PARTY: "三次元",
        }[self]


class Subject(BaseModel):
    """条目信息"""

    id: int
    type: SubjectType
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
            type=self.type.to_str(),
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
    

class CharacterType(int, Enum):
    """角色类型"""
    
    CHARACTER = 1
    MACHINE = 2
    SHIP = 3
    GROUP = 4
    
    def to_str(self) -> str:
        return {
            CharacterType.CHARACTER: "角色",
            CharacterType.MACHINE: "机体",
            CharacterType.SHIP: "舰船",
            CharacterType.GROUP: "组织",
        }[self]


class Character(BaseModel):
    """角色信息"""

    id: int
    name: str
    type: CharacterType
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
            type=self.type.to_str(),
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
    
class Career(str, Enum):    
    """职业"""

    PRODUCER = "producer"
    MANGAKA = "mangaka"
    ARTIST = "artist"
    SEIYU = "seiyu"
    WRITER = "writer"
    ILLUSTRATOR = "illustrator"
    ACTOR = "actor"
    
    def to_str(self) -> str:
        return {
            Career.PRODUCER: "制作人",
            Career.MANGAKA: "漫画家",
            Career.ARTIST: "艺术家",
            Career.SEIYU: "声优",
            Career.WRITER: "编剧",
            Career.ILLUSTRATOR: "插画师",
            Career.ACTOR: "演员",
        }[self]
        
class PersonType(int, Enum):
    """人物类型"""
    
    PERSON = 1
    COMPANY = 2
    GROUP = 3
    
    def to_str(self) -> str:
        return {
            PersonType.PERSON: "个人",
            PersonType.COMPANY: "公司",
            PersonType.GROUP: "组合",
        }[self]

class Person(BaseModel):
    """人物信息"""

    id: int
    name: str
    type: PersonType
    career: List[Career]
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
    
    def to_simple(self) -> "SimplePerson":
        return SimplePerson(
            id=self.id,
            name=self.name,
            type=self.type.to_str(),
            career=[career.to_str() for career in self.career],
        )
    
    
class SimplePerson(BaseModel):
    """人物信息(基础)"""

    id: int
    name: str
    type: str
    career: List[str]
    summary: Optional[str] = None
    infobox: Optional[List[WikiInfoboxItem]] = None
    

class SubjectCharacter(BaseModel):
    """条目关联角色"""

    id: int
    name: str
    type: CharacterType
    images: Optional[Images] = None
    relation: str
    actor: Optional[List[Person]] = None
    
    def to_simple(self) -> "SimpleSubjectCharacter":
        return SimpleSubjectCharacter(
            id=self.id,
            name=self.name,
            type=self.type.to_str(),
            relation=self.relation,
            actor=[person.to_simple() for person in self.actor] if self.actor else None,
        )

class SimpleSubjectCharacter(BaseModel):
    """条目关联角色(基础)"""

    id: int
    name: str
    type: str
    relation: str
    actor: Optional[List[SimplePerson]] = None
    detail: Optional[SimpleCharacter] = None
    

class SubjectPerson(BaseModel):
    """条目关联人物"""

    id: int
    name: str
    type: PersonType
    images: Optional[Images] = None
    relation: str
    eps: str
    career: List[Career]
    
    def to_simple(self) -> "SimpleSubjectPerson":
        return SimpleSubjectPerson(
            id=self.id,
            name=self.name,
            type=self.type.to_str(),
            relation=self.relation,
            eps=self.eps,
            career=[career.to_str() for career in self.career],
        )
        
        
class SimpleSubjectPerson(BaseModel):
    """条目关联人物(基础)"""

    id: int
    name: str
    type: str
    relation: str
    eps: str
    career: List[str]
    detail: Optional[SimplePerson] = None
    
    
class SubjectRelation(BaseModel):
    """条目关联"""
    
    id: int
    type: SubjectType
    name: str
    name_cn: Optional[str] = None
    images: Optional[Images] = None
    relation: str
    
    def to_simple(self) -> "SimpleSubjectRelation":
        return SimpleSubjectRelation(
            id=self.id,
            type=self.type.to_str(),
            name=self.name,
            name_cn=self.name_cn,
            relation=self.relation,
        )
        

class SimpleSubjectRelation(BaseModel):
    """条目关联(基础)"""

    id: int
    type: str
    name: str
    name_cn: Optional[str] = None
    relation: str
    
    
class CharacterSubject(BaseModel):
    """角色关联条目"""

    id: int
    type: SubjectType
    staff: str
    name: str
    name_cn: Optional[str] = None
    image: str

    def to_simple(self) -> "SimpleCharacterSubject":
        return SimpleCharacterSubject(
            id=self.id,
            type=self.type.to_str(),
            staff=self.staff,
            name=self.name,
            name_cn=self.name_cn,
        )
    
    
class SimpleCharacterSubject(BaseModel):
    """角色关联条目(基础)"""

    id: int
    type: str
    staff: str
    name: str
    name_cn: Optional[str] = None


class CharacterPerson(BaseModel):
    """角色关联人物"""

    id: int
    name: str
    type: PersonType
    images: Optional[Images] = None
    subject_id: int
    subject_type: SubjectType
    subject_name: str
    subject_name_cn: Optional[str] = None
    staff: Optional[str] = None
    
    def to_simple(self) -> "SimpleCharacterPerson":
        return SimpleCharacterPerson(
            id=self.id,
            name=self.name,
            type=self.type.to_str(),
            subject_id=self.subject_id,
            subject_type=self.subject_type.to_str(),
            subject_name=self.subject_name,
            subject_name_cn=self.subject_name_cn,
            staff=self.staff,
        )
        
class SimpleCharacterPerson(BaseModel):
    """角色关联人物(基础)"""

    id: int
    name: str
    type: str
    subject_id: int
    subject_type: str
    subject_name: str