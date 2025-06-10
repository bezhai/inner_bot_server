"""
文本处理工具模块
用于处理和转换各种文本格式
"""

import re
from typing import Dict, List, Tuple
import logging

logger = logging.getLogger(__name__)


class RefLinkToNumberTagConverter:
    """将引用语法 (ref:URL) 转换为数字角标语法的转换器"""

    def __init__(self):
        # 引用语法的正则表达式模式：(ref:URL)
        self.ref_pattern = r"\(ref:([^)]+)\)"

    def convert(self, text: str) -> str:
        """
        将文本中的引用语法转换为数字角标

        Args:
            text: 包含引用语法的文本

        Returns:
            转换后的文本，将 (ref:URL) 替换为 <number_tag>数字</number_tag>
        """
        if not text or not text.strip():
            return text

        try:
            # 查找所有引用标记
            ref_matches = self._extract_ref_links(text)

            if not ref_matches:
                return text

            # 替换为数字角标格式
            converted_text = self._replace_ref_links_with_number_tags(text, ref_matches)

            return converted_text

        except Exception as e:
            logger.error(f"转换引用语法时出错: {e}")
            return text  # 出错时返回原文本

    def _extract_ref_links(self, text: str) -> List[Tuple[str, str]]:
        """
        提取文本中的所有引用标记

        Returns:
            List of (完整匹配文本, URL)
        """
        matches = re.finditer(self.ref_pattern, text)
        ref_links = []

        for match in matches:
            full_match = match.group(0)  # 完整的 (ref:URL)
            url = match.group(1)  # URL
            ref_links.append((full_match, url))

        return ref_links

    def _replace_ref_links_with_number_tags(
        self, text: str, ref_links: List[Tuple[str, str]]
    ) -> str:
        """
        将引用标记替换为数字角标格式
        """
        converted_text = text

        # 为每个引用分配序号（按出现顺序）
        for i, (full_match, url) in enumerate(ref_links, 1):
            # 生成数字角标标签
            number_tag = self._create_number_tag(i, url)

            # 替换第一个匹配项（避免重复替换）
            converted_text = converted_text.replace(full_match, number_tag, 1)

        return converted_text

    def _create_number_tag(self, number: int, url: str) -> str:
        """
        创建数字角标标签

        Args:
            number: 角标数字 (1-99)
            url: 跳转链接

        Returns:
            数字角标标签字符串
        """
        # 确保数字在有效范围内
        number = max(1, min(99, number))

        return f"<number_tag background_color='grey-50' font_color='grey-600' url='{url}'>{number}</number_tag>"


class StreamingRefProcessor:
    """流式引用处理器，支持增量转换"""

    def __init__(self):
        self.converter = RefLinkToNumberTagConverter()
        self.accumulated_text = ""
        self.last_converted_text = ""
        self.ref_counter = 0  # 已分配的引用序号计数器

    def process_chunk(self, chunk_text: str) -> str:
        """
        处理文本块，返回增量转换结果

        Args:
            chunk_text: 当前文本块

        Returns:
            转换后的完整文本
        """
        if chunk_text:
            self.accumulated_text += chunk_text

        # 对累积的文本进行转换
        converted_text = self.converter.convert(self.accumulated_text)

        # 更新最后转换的文本
        self.last_converted_text = converted_text

        return converted_text

    def get_final_result(self) -> str:
        """获取最终转换结果"""
        return self.last_converted_text

    def reset(self):
        """重置处理器状态"""
        self.accumulated_text = ""
        self.last_converted_text = ""
        self.ref_counter = 0


# 创建全局实例
ref_converter = RefLinkToNumberTagConverter()


def convert_ref_links_to_number_tags(text: str) -> str:
    """
    便捷函数：将文本中的引用语法转换为数字角标

    Args:
        text: 包含引用语法的文本

    Returns:
        转换后的文本
    """
    return ref_converter.convert(text)


# 测试函数
def test_converter():
    """测试转换器功能"""
    test_cases = [
        "反田叶月是一位日本艺人(ref:https://example.com)，她很有才华。",
        "我找到了相关信息：OpenAI官网(ref:https://openai.com)和ChatGPT介绍(ref:https://chat.openai.com)。",
        "这是一个测试(ref:https://test.com)，还有另一个引用(ref:https://another.com)和第三个(ref:https://third.com)。",
        "没有引用的普通文本。",
        "主人，我找到了这些信息(ref:https://info.com)哦~ ♪",
    ]

    for i, test_text in enumerate(test_cases, 1):
        result = convert_ref_links_to_number_tags(test_text)
        print(f"测试用例 {i}:")
        print(f"原文: {test_text}")
        print(f"转换: {result}")
        print("-" * 80)


if __name__ == "__main__":
    test_converter()
