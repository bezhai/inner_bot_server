"""文本分块工具"""


def chunk_text(
    text: str,
    chunk_size: int = 500,
    overlap: int = 50,
) -> list[str]:
    """将长文本按字符数分块。

    Args:
        text: ���分块的文本。
        chunk_size: 每个块的目标字符数，默认 500。
        overlap: 块之间的重叠字符数，默认 50。

    Returns:
        分块后的文本列表。
    """
    if not text or len(text) <= chunk_size:
        return [text] if text else []

    chunks = []
    start = 0
    text_len = len(text)

    while start < text_len:
        end = start + chunk_size

        # 尝试在句子边界处切分（句号、问号、感叹号、换行）
        if end < text_len:
            # 在 chunk_size 范围内找最后一个句子结束符
            best_break = -1
            for sep in ["\n\n", "\n", "。", "！", "？", ". ", "! ", "? "]:
                pos = text.rfind(sep, start, end)
                if pos > best_break:
                    best_break = pos + len(sep)

            if best_break > start:
                end = best_break

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        # 下一个块的起始位置（考虑重叠）
        start = end - overlap if end < text_len else text_len

    return chunks
