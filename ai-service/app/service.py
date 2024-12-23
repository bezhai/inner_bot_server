import openai
import json
from meta_info import get_model_setting
from gpt import ChatModelFactory

async def get_ai_response(model: str, **kwargs):
    """
    调用 AI 模型并返回响应或流式响应。
    
    :param model: 使用的模型名称
    :param messages: 与 AI 模型的对话内容
    :param temperature: 输出的随机性，值越高，结果越随机
    :param stream: 是否启用流式响应
    :return: 生成器（如果 stream=True），否则返回完整的响应
    """
    
    model_setting = await get_model_setting(model)
    
    if model_setting is None:
        raise Exception("model setting not found")

    client = ChatModelFactory.create_gpt_model(
        base_url=model_setting['base_url'], 
        api_key=model_setting['api_key'])
    
    return await client.chat(
        model=model_setting['model'],
        **kwargs,
    )