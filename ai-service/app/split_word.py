from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Dict
import jieba.analyse

# 输入数据模型
class BatchExtractRequest(BaseModel):
    texts: List[str]  # 批量文本
    top_n: int        # 每个文本提取的关键词数量

# 输出数据模型
class ExtractResult(BaseModel):
    text: str
    keywords: List[Dict[str, float]]

def extract_batch(request: BatchExtractRequest):
    results = []
    for text in request.texts:
        # 使用 jieba 提取关键词
        keywords = jieba.analyse.extract_tags(text, topK=request.top_n, withWeight=True)
        result = {"text": text, "keywords": [{"word": word, "weight": weight} for word, weight in keywords]}
        results.append(result)
    return results