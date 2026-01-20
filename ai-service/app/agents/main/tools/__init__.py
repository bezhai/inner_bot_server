"""Main Agent 工具集

简化后的工具列表，包含以下能力：
1. 统一搜索 (unified_search) - 整合所有搜索功能
2. 图片生成 (generate_image) - AI图片生成
3. 历史检索 (search_history) - 历史消息和群成员查询
"""

from app.agents.history.agent import search_history
from app.agents.img_gen.agent import generate_image
from app.agents.search.agent import unified_search

MAIN_TOOLS = [
    unified_search,  # 统一搜索入口（整合 web、同人展搜索）
    generate_image,  # 图片生成
    search_history,  # 历史检索
]
