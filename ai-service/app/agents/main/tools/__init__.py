"""Main Agent 工具集

简化后的工具列表，只包含两个高层能力：
1. 统一搜索 (unified_search) - 整合所有搜索功能
2. 图片生成 (generate_image) - AI图片生成
"""

from app.agents.img_gen.agent import generate_image
from app.agents.search.agent import unified_search

MAIN_TOOLS = [
    unified_search,  # 统一搜索入口（整合 web、同人展、bangumi 搜索）
    generate_image,  # 图片生成
]
