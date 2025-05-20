import json
from typing import List
from pydantic import BaseModel
import requests
from app.services.meta_info import get_model_setting
from app.services.gpt import ChatModelFactory, ChatRequest, Message
import logging
from app.config.config import settings
import httpx

logger = logging.getLogger(__name__)

async def ai_chat(request: ChatRequest):
    """
    调用 AI 模型并返回响应或流式响应。
    
    :param model: 使用的模型名称
    :param messages: 与 AI 模型的对话内容
    :param temperature: 输出的随机性，值越高，结果越随机
    :param stream: 是否启用流式响应
    :return: 生成器（如果 stream=True），否则返回完整的响应
    """
    
    model_setting = await get_model_setting(request.model)
    
    if model_setting is None:
        raise Exception("model setting not found")

    client = ChatModelFactory.create_gpt_model(
        base_url=model_setting['base_url'], 
        api_key=model_setting['api_key'])
    
    request.model = model_setting['model'] # 替换为实际的模型名称
    
    # o系列模型需要将请求中的system替换为developer
    if request.model.startswith('o1') or request.model.startswith('o3'):
        for message in request.messages:
            if message.role == 'system':
                message.role = 'developer'

    return await client.chat(request)

class SearchResult(BaseModel):
    result: List[str]
    need_search: bool

class WebSearchResult(BaseModel):
    title: str
    link: str
    snippet: str

async def parse_message_keywords(message: str) -> SearchResult:
    """
    解析消息中的关键词
    """
    prompt = """
请分析用户的输入内容，判断是否有必要进行搜索。判断标准包括但不限于：

- 用户明确要求"搜索"、"查找"、"最新"、"资料"等
- 主题涉及专业性较强、知识库中可能缺乏或更新较快的内容
- 涉及特定年份、数字、事件等时效性要求高的内容

如果需要进行搜索，请：

1. 提取不超过5个搜索关键词，提取的标准是能通过关键词搜索到需要补齐的信息，例如专有名词、技术术语、关键实体、保留数字和年份等量化信息。
2. 以如下JSON格式返回：{"result": [关键词], "need_search": true}
3. 如果不需要搜索，仅返回：{"need_search": false}

示例：
输入：我想了解今年人工智能在医疗影像诊断方面有什么突破性进展
输出：{"result": ["人工智能", "医疗影像诊断", "2025", "突破性进展"], "need_search": true}

请根据以上标准处理所有用户输入。
    """
    
    completion = await ai_chat(ChatRequest(
        model="gpt-4o-mini",
        messages=[
            Message(
                role="system",
                content=prompt
            ),
            Message(
                role="user",
                content=message
            )
        ],
        stream=False
    ))
    
    content = completion.choices[0].message.content
    
    try:
        return SearchResult.model_validate_json(content)
    except Exception as e:
        logger.error(f"parse message keywords failed: {e}")
        return SearchResult(result=[], need_search=False)
    
    
async def search_web(keywords: List[str]) -> List[WebSearchResult]:
    """
    搜索网络上的信息，并返回结构化的搜索结果
    """
    url = "https://api.302.ai/search1api/search"

    payload = json.dumps({
        "query": " ".join(keywords)
    })
    headers = {
        'Authorization': f'Bearer {settings.search_api_key}',
        'Content-Type': 'application/json'
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(url, headers=headers, data=payload)
        response.raise_for_status()
        data = response.json()

    results = data.get("results", [])
    return [WebSearchResult(**item) for item in results]

