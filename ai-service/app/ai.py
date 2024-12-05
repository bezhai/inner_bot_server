import openai
from app.config import settings
import json

# 初始化 OpenAI 客户端
client = openai.OpenAI(
    api_key=settings.dashscope_api_key,  # 从配置中读取 API Key
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
)

async def get_ai_response(model: str, messages: list, temperature: float = 0.7, stream: bool = False):
    """
    调用 AI 模型并返回响应或流式响应。
    
    :param model: 使用的模型名称
    :param messages: 与 AI 模型的对话内容
    :param temperature: 输出的随机性，值越高，结果越随机
    :param stream: 是否启用流式响应
    :return: 生成器（如果 stream=True），否则返回完整的响应
    """
    
    if stream:
        completion = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            stream=stream,
            stream_options={"include_usage": True},
            extra_body={
                "enable_search": True
            }
        )

        # 如果流式传输，返回生成器
        async def event_generator():
            for chunk in completion:
                yield json.dumps(chunk.model_dump()) + "\n"
        return event_generator()
    else:
        
        completion = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            stream=stream,
        )
        
        # 如果不是流式，返回完整的响应
        return completion