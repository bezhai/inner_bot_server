import json
from typing import Any
import openai
import abc
import threading
from typing import Any


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
    async def chat(self, **kwargs) -> Any:
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
        self.client = openai.OpenAI(
            api_key=api_key,
            base_url=base_url,
        )


    async def chat(self, **kwargs) -> Any:
        """
        调用 OpenAI 模型进行对话。
        """
        completion = self.client.completions.create(*kwargs)
        
        if kwargs.get("stream", False):       
            async def event_generator():
                for chunk in completion:
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