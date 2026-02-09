"""消息内容解析器

兼容 v1 (markdown) 和 v2 (JSON) 两种存储格式。
- v2: {"v": 2, "text": "...", "items": [...]}
- v1: 纯 markdown 字符串（历史数据）
"""

import json
import re
from dataclasses import dataclass, field

_IMAGE_RE = re.compile(r"!\[image\]\(([^)]+)\)")


@dataclass
class ParsedContent:
    text: str  # 纯文本（v2 直接取 text 字段，v1 通过正则去除图片标记）
    image_keys: list[str]  # 图片 key 列表
    items: list[dict] = field(default_factory=list)  # v2 原始 items（v1 时为空列表）


def parse_content(raw: str) -> ParsedContent:
    """解析消息内容，兼容 v1 (markdown) 和 v2 (JSON)"""
    # 尝试 v2
    try:
        data = json.loads(raw)
        if isinstance(data, dict) and data.get("v") == 2:
            text = data.get("text", "")
            items = data.get("items", [])
            image_keys = [
                item["value"] for item in items if item.get("type") == "image"
            ]
            return ParsedContent(text=text, image_keys=image_keys, items=items)
    except (json.JSONDecodeError, TypeError):
        pass

    # 回退 v1
    image_keys = _IMAGE_RE.findall(raw)
    text = _IMAGE_RE.sub("", raw).strip()
    return ParsedContent(text=text, image_keys=image_keys)
