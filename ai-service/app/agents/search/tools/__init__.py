"""向后兼容层 - Search Tools

重定向到 app.agents.tools.search
"""

import warnings

warnings.warn(
    "app.agents.search.tools is deprecated. "
    "Please use app.agents.tools.search instead.",
    DeprecationWarning,
    stacklevel=2,
)

# 从旧位置的子模块中重新导出
from app.agents.search.tools.allcpp import search_donjin_event
from app.agents.search.tools.bangumi import (
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
from app.agents.search.tools.web import search_web

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
