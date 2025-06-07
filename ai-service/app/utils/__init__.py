"""
工具模块，包含工具函数，如文本分词。
"""

from .split_word import extract_batch, BatchExtractRequest, ExtractResult

__all__ = ['extract_batch', 'BatchExtractRequest', 'ExtractResult']