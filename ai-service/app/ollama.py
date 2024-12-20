import json
from ollama import Client

client = Client(
  host=f'http://10.37.78.98:11434',
  headers={}
)

async def get_ollama_ai_response(model: str, messages: list, temperature: float = 0.7):
    """
    调用 AI 模型并返回响应或流式响应。
    
    :param model: 使用的模型名称
    :param messages: 与 AI 模型的对话内容
    :param temperature: 输出的随机性，值越高，结果越随机
    :param stream: 是否启用流式响应
    :return: 生成器（如果 stream=True），否则返回完整的响应
    """
    
    completion = client.chat(
            model=model,
            messages=messages,
            options={
                "temperature":temperature
            },
            stream=True,
            # stream_options={"include_usage": True},
            # extra_body={
            #     "enable_search": True
            # }
        )
    # 如果流式传输，返回生成器
    async def event_generator():
        for chunk in completion:
            yield json.dumps(chunk.model_dump()) + "\n"
    return event_generator()