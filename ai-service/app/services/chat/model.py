from app.orm.crud import get_model_and_provider_info
from openai import AsyncOpenAI
from openai.types.chat.chat_completion import Choice
from typing import Dict, List, AsyncGenerator, Optional, Any
import asyncio
import json
from contextlib import asynccontextmanager
from collections import defaultdict

from app.tools import get_tool_manager

class ModelService:
    # 类级别缓存，用于存储OpenAI客户端实例
    _client_cache: Dict[str, AsyncOpenAI] = {}
    # 类级别锁，用于保护缓存访问
    _cache_lock = asyncio.Lock()
    # 模型级别锁，用于防止同一模型并发创建多个实例
    _model_locks: Dict[str, asyncio.Lock] = {}
    
    @staticmethod
    async def get_model_info(model_id: str) -> dict:
        model_info = await get_model_and_provider_info(model_id)
        if model_info is None:
            raise Exception("model info not found")
        return model_info
    
    @staticmethod
    @asynccontextmanager
    async def _get_model_lock(model_id: str):
        """获取特定模型的锁"""
        async with ModelService._cache_lock:
            if model_id not in ModelService._model_locks:
                ModelService._model_locks[model_id] = asyncio.Lock()
            lock = ModelService._model_locks[model_id]
        async with lock:
            yield
    
    @staticmethod
    async def get_openai_client(model_id: str) -> AsyncOpenAI:
        """
        通过model_id获取OpenAI客户端实例
        支持缓存以提高复用性，并保证并发安全
        """
        # 先检查缓存中是否已有该model_id的客户端
        async with ModelService._cache_lock:
            if model_id in ModelService._client_cache:
                return ModelService._client_cache[model_id]
        
        # 如果缓存中没有，使用模型特定的锁来创建新实例
        async with ModelService._get_model_lock(model_id):
            # 双重检查，防止在获取锁的过程中其他协程已经创建了实例
            async with ModelService._cache_lock:
                if model_id in ModelService._client_cache:
                    return ModelService._client_cache[model_id]
            
            # 获取模型和供应商信息
            model_info = await ModelService.get_model_info(model_id)
            
            # 创建OpenAI客户端实例
            client = AsyncOpenAI(
                api_key=model_info['api_key'],
                base_url=model_info['base_url']
            )
            
            # 将新创建的客户端加入缓存
            async with ModelService._cache_lock:
                ModelService._client_cache[model_id] = client
            
            return client
    
    @staticmethod
    def _assemble_tool_calls(tool_call_chunks: List[Any]) -> List[Dict[str, Any]]:
        """
        组装流式工具调用片段为完整的工具调用对象
        
        Args:
            tool_call_chunks: 工具调用片段列表
            
        Returns:
            完整的工具调用对象列表
        """
        tool_calls_dict = defaultdict(lambda: {
            "id": "", 
            "type": "function", 
            "function": {"name": "", "arguments": ""}
        })
        
        for chunk in tool_call_chunks:
            index = chunk.index
            tc = tool_calls_dict[index]
            
            if chunk.id:
                tc["id"] += chunk.id
            if chunk.function.name:
                tc["function"]["name"] += chunk.function.name
            if chunk.function.arguments:
                tc["function"]["arguments"] += chunk.function.arguments
        
        return list(tool_calls_dict.values())
    
    @staticmethod
    async def chat_completion_stream(
        model_id: str,
        messages: List[dict],
        temperature: float = 1.0,
        tools: Optional[List[dict]] = None,
        tool_choice: Optional[str] = "auto",
        max_tool_iterations: int = 10,
        **kwargs
    ) -> AsyncGenerator[Choice, None]:
        """
        发送流式聊天补全请求到OpenAI，支持工具调用
        
        Args:
            model_id: 内部模型ID
            messages: 消息列表
            temperature: 温度参数，控制随机性
            tools: 可用工具列表
            tool_choice: 工具选择策略 ("auto", "none", 或特定工具)
            max_tool_iterations: 最大工具调用迭代次数
            **kwargs: 其他OpenAI支持的参数
        
        Returns:
            Choice的异步生成器，每个Choice包含增量的回复内容
        """
        # 获取客户端和模型信息
        client = await ModelService.get_openai_client(model_id)
        model_info = await ModelService.get_model_info(model_id)
        
        # 使用实际的model_name而不是model_id
        model_name = model_info['model_name']
        
        # 复制消息列表以避免修改原始数据
        current_messages = messages.copy()
        iteration_count = 0
        
        while iteration_count < max_tool_iterations:
            # 构建请求参数
            request_params = {
                'model': model_name,
                'messages': current_messages,
                'temperature': temperature,
                'stream': True,
                **kwargs
            }
            
            # 如果有工具，添加工具参数
            if tools:
                request_params['tools'] = tools
                request_params['tool_choice'] = tool_choice
            
            # 发送请求
            stream = await client.chat.completions.create(**request_params)
            
            # 收集流式响应
            tool_call_chunks = []
            current_content = ""
            has_tool_calls = False
            
            async for chunk in stream:
                if chunk.choices:
                    choice = chunk.choices[0]
                    delta = choice.delta
                    
                    # 处理内容
                    if delta and delta.content:
                        current_content += delta.content
                        # 流式输出内容
                        yield choice
                    
                    # 处理工具调用
                    if delta and delta.tool_calls:
                        has_tool_calls = True
                        tool_call_chunks.extend(delta.tool_calls)
                    
                    # 检查是否完成
                    if choice.finish_reason:
                        break
            
            # 如果没有工具调用，直接结束
            if not has_tool_calls or not tools:
                break
            
            # 组装工具调用
            tool_calls = ModelService._assemble_tool_calls(tool_call_chunks)
            
            # 添加助手消息到对话历史
            current_messages.append({
                "role": "assistant",
                "content": current_content if current_content else None,
                "tool_calls": tool_calls
            })
            
            # 执行工具调用
            for tool_call in tool_calls:
                function_name = tool_call['function']['name']
                
                try:
                    # 解析工具参数
                    function_args = json.loads(tool_call['function']['arguments'])
                    
                    # 使用新的工具管理器执行工具
                    tool_manager = get_tool_manager()
                    function_response = await tool_manager.execute_tool(function_name, function_args)
                    
                    # 添加工具响应
                    current_messages.append({
                        "tool_call_id": tool_call['id'],
                        "role": "tool",
                        "name": function_name,
                        "content": json.dumps(function_response) if not isinstance(function_response, str) else function_response
                    })
                    
                except Exception as e:
                    # 工具执行错误处理
                    current_messages.append({
                        "tool_call_id": tool_call['id'],
                        "role": "tool",
                        "name": function_name,
                        "content": f"Error: {str(e)}"
                    })
            
            # 重置内容累积器，继续下一轮对话
            current_content = ""
            iteration_count += 1
    
    