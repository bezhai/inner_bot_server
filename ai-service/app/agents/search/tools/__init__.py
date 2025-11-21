"""搜索工具集"""

from .allcpp import search_donjin_event
from .bangumi import (
    get_character_persons,
    get_character_subjects,
    get_person_characters,
    get_person_subjects,
    get_subject_characters,
    get_subject_persons,
    get_subject_relations,
    search_characters,
    search_persons,
    search_subjects,
)
from .web import search_web

__all__ = [
    # Web 搜索
    "search_web",
    # 同人展搜索
    "search_donjin_event",
    # Bangumi 搜索工具
    "search_subjects",
    "search_characters",
    "search_persons",
    "get_subject_characters",
    "get_subject_persons",
    "get_subject_relations",
    "get_character_subjects",
    "get_character_persons",
    "get_person_characters",
    "get_person_subjects",
]
