import json
from typing import Any
import openai
import abc
import threading
from typing import Any


from typing import (
    List,
    Optional,
    Union,
    Dict,
    Literal,
)
from pydantic import BaseModel, Field


class TextMessageContent(BaseModel):
    """文本消息内容。"""
    type: Literal["text"]
    text: str
    

class ImageUrl(BaseModel):
    """图片 URL 信息。"""
    url: str
    detail: Optional[str] = None

class ImageMessageContent(BaseModel):
    """图片消息内容。"""
    type: Literal["image_url"]
    image_url: ImageUrl
    

class AudioUrl(BaseModel):
    """音频 URL 信息。"""
    data: str
    format: str


class AudioMessageContent(BaseModel):
    """音频消息内容。"""
    type: Literal["audio_url"]
    audio_url: AudioUrl


class AssistantToolCall(BaseModel):
    """助手函数调用。"""
    id: str
    type: str
    function: Dict[str, Any]

class Message(BaseModel):
    """单条对话消息，符合 OpenAI 的 `messages` 参数格式。"""
    role: Literal["system", "user", "assistant", "tool", "developer"]
    content: Optional[Union[str, List[Union[TextMessageContent, ImageMessageContent, AudioMessageContent]]]] = None  # 消息内容
    name: Optional[str] = None  # 可选：函数名（如果 role 是 "function"）
    tool_calls: Optional[List[AssistantToolCall]] = None  # 可选：助手函数调用列表（如果 role 是 "assistant"）
    tool_call_id: Optional[str] = None  # 可选：工具调用 ID（如果 role 是 "tool"）

class FunctionCall(BaseModel):
    """函数调用参数。"""
    name: Optional[str] = None
    arguments: Optional[Dict[str, Any]] = None

class Function(BaseModel):
    """函数定义参数。"""
    name: str
    description: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None

class ChatCompletionModality(BaseModel):
    """聊天完成的模态类型。"""
    modality: str
    content: Any

class ChatCompletionAudioParam(BaseModel):
    """音频参数。"""
    format: str
    data: bytes

class ChatCompletionPredictionContentParam(BaseModel):
    """预测内容参数。"""
    type: str
    content: Any


class ToolFunction(BaseModel):
    """工具函数参数。"""
    name: str
    description: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None
    strict: Optional[bool] = None

class ChatCompletionToolParam(BaseModel):
    """工具参数。"""
    type: str
    function: ToolFunction
    
class ChatCompletionToolChoiceOptionParam(BaseModel):
    """工具选择配置。"""
    type: str
    function: Optional[ToolFunction] = None

class ResponseFormat(BaseModel):
    """响应格式配置。"""
    format_type: str
    options: Optional[Dict[str, Any]] = None

class ChatRequest(BaseModel):
    """
    与 OpenAI Chat Completion API 完全对齐的请求参数模型。
    文档参考：https://platform.openai.com/docs/api-reference/chat
    """
    model: str = Field(..., description="模型名称，例如 'gpt-4', 'gpt-4-32k', 或 'gpt-3.5-turbo'")
    messages: List[Message] = Field(..., description="对话消息列表，包含角色和用户/助手的内容")
    temperature: Optional[float] = Field(
        1.0, 
        ge=0.0, 
        le=2.0, 
        description="采样温度，范围 0-2。值越大，输出越随机；值越小，输出越确定。"
    )
    top_p: Optional[float] = Field(
        1.0, 
        ge=0.0, 
        le=1.0, 
        description="核采样的概率阈值，范围 0-1。"
    )
    n: Optional[int] = Field(
        1, 
        ge=1,
        description="生成的聊天回复数量。"
    )
    stream: Optional[bool] = Field(
        False, 
        description="是否启用流式传输模式（逐步发送 token）。"
    )
    stop: Optional[Union[str, List[str]]] = Field(
        None, 
        description="停止生成的字符串或字符串列表。"
    )
    max_tokens: Optional[int] = Field(
        None, 
        ge=1,
        description="生成的最大 token 数量。默认为无限制。"
    )
    max_completion_tokens: Optional[int] = Field(
        None, 
        ge=1,
        description="生成的最大 completion token 数量。"
    )
    presence_penalty: Optional[float] = Field(
        0.0, 
        ge=-2.0, 
        le=2.0, 
        description="控制生成内容的新颖性。值越大，越倾向于生成新的内容。"
    )
    frequency_penalty: Optional[float] = Field(
        0.0, 
        ge=-2.0, 
        le=2.0, 
        description="控制生成内容的重复性。值越大，越倾向于减少重复内容。"
    )
    logit_bias: Optional[Dict[str, int]] = Field(
        None, 
        description="对特定 token 的生成概率加权。"
    )
    user: Optional[str] = Field(
        None, 
        description="用于区分用户的唯一标识符。"
    )
    response_format: Optional[ResponseFormat] = Field(
        None,
        description="响应格式配置。"
    )
    tools: Optional[List[ChatCompletionToolParam]] = Field(
        None,
        description="工具列表，用于工具调用。"
    )
    tool_choice: Optional[Union[str, ChatCompletionToolChoiceOptionParam]] = Field(
        None,
        description="工具选择配置。"
    )
    audio: Optional[ChatCompletionAudioParam] = Field(
        None,
        description="音频输入参数。"
    )
    function_call: Optional[FunctionCall] = Field(
        None,
        description="函数调用参数。"
    )
    functions: Optional[List[Function]] = Field(
        None,
        description="可用的函数列表，用于助手调用。"
    )
    logprobs: Optional[bool] = Field(
        None,
        description="是否返回 token 的对数概率。"
    )
    metadata: Optional[Dict[str, str]] = Field(
        None,
        description="附加的元数据。"
    )
    modalities: Optional[List[ChatCompletionModality]] = Field(
        None,
        description="模态列表。"
    )
    parallel_tool_calls: Optional[bool] = Field(
        None,
        description="是否并行调用工具。"
    )
    prediction: Optional[ChatCompletionPredictionContentParam] = Field(
        None,
        description="预测内容参数。"
    )
    seed: Optional[int] = Field(
        None,
        description="用于随机性的种子值。"
    )
    service_tier: Optional[Literal["auto", "default"]] = Field(
        None,
        description="服务层级，支持 'auto' 或 'default'。"
    )
    store: Optional[bool] = Field(
        None,
        description="是否存储生成的内容。"
    )
    top_logprobs: Optional[int] = Field(
        None,
        ge=1,
        description="返回 top N 个候选的对数概率。"
    )
    extra_headers: Optional[Dict[str, Any]] = Field(
        None,
        description="传递给 API 的额外头信息。"
    )
    extra_query: Optional[Dict[str, Any]] = Field(
        None,
        description="传递给 API 的额外查询参数。"
    )
    extra_body: Optional[Dict[str, Any]] = Field(
        None,
        description="传递给 API 的额外请求体参数。"
    )
    timeout: Optional[Union[float, Any]] = Field(
        None,
        description="请求超时时间。可以是秒数或 `httpx.Timeout` 对象。"
    )
    

class SingletonMeta(type):
    """
    元类实现单例模式，同时支持不同配置的实例缓存。
    """
    _instances = {}  # 缓存所有实例
    _lock = threading.Lock()  # 确保线程安全

    def __call__(cls, *args, **kwargs):
        # 生成唯一缓存键，确保不同配置的实例独立
        cache_key = cls._generate_cache_key(*args, **kwargs)

        # 双重检查锁，确保线程安全
        if cache_key not in cls._instances:
            with cls._lock:
                if cache_key not in cls._instances:
                    # 创建并缓存实例
                    cls._instances[cache_key] = super().__call__(*args, **kwargs)
        return cls._instances[cache_key]

    @staticmethod
    def _generate_cache_key(*args, **kwargs) -> str:
        """
        生成实例的唯一缓存键，基于参数。
        """
        key_parts = []
        key_parts.extend(str(arg) for arg in args)  # 添加位置参数
        key_parts.extend(f"{k}={v}" for k, v in sorted(kwargs.items()))  # 添加关键字参数（按字典键排序）
        return "|".join(key_parts)


# 抽象模型接口
class BaseChatModel(abc.ABC):
    """
    抽象类定义统一的对话模型接口。
    子类需要实现 `chat` 方法。
    """

    @abc.abstractmethod
    async def chat(self, chat_request: ChatRequest) -> Any:
        """
        模型对话接口，支持流式响应和非流式响应。
        """
        pass


class OpenAIChatModel(BaseChatModel):
    """
    OpenAI 模型封装，自动初始化内部客户端。
    """

    def __init__(self, api_key: str, base_url: str = "https://api.openai.com/v1"):
        """
        初始化 OpenAI 模型接口。
        :param api_key: OpenAI API 的密钥
        :param base_url: OpenAI API 的基础 URL（默认为官方地址）
        """
        self.client = openai.AsyncOpenAI(
            api_key=api_key,
            base_url=base_url,
        )


    async def chat(self, chat_request: ChatRequest) -> Any:
        """
        调用 OpenAI 模型进行对话。
        """
                
        completion = await self.client.chat.completions.create(**chat_request.model_dump())
        
        if chat_request.stream:       
            async def event_generator():
                async for chunk in completion:
                    yield json.dumps(chunk.model_dump()) + "\n"
            return event_generator()
        else:
            return completion
        

class ChatModelFactory:
    """
    工厂类，用于动态创建模型实例。
    """

    @staticmethod
    def create_gpt_model(base_url: str, api_key: str) -> OpenAIChatModel:
        """
        创建 GPT 模型实例。
        :param base_url: OpenAI API 的基础 URL
        :param api_key: OpenAI API 的密钥
        :return: GPTChatModel 实例（单例）
        """
        return OpenAIChatModel(base_url=base_url, api_key=api_key)
