"""
测试配置和共享fixture
"""

import asyncio
from collections.abc import Generator
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from faker import Faker

# 全局faker实例
fake = Faker()


@pytest.fixture(scope="session")
def event_loop() -> Generator[asyncio.AbstractEventLoop, None, None]:
    """创建事件循环用于异步测试"""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def mock_message_data() -> dict[str, Any]:
    """提供标准的消息数据fixture"""
    return {
        "message_id": fake.uuid4(),
        "user_id": fake.uuid4(),
        "content": fake.text(max_nb_chars=200),
        "timestamp": fake.date_time().isoformat(),
    }


@pytest.fixture
def mock_tool_schema() -> dict[str, Any]:
    """提供标准的工具schema fixture"""
    return {
        "type": "function",
        "function": {
            "name": "test_tool",
            "description": "A test tool",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"}
                },
                "required": ["query"],
            },
        },
    }


@pytest.fixture
def mock_redis_client() -> MagicMock:
    """提供mock的Redis客户端"""
    mock = MagicMock()
    mock.set = AsyncMock(return_value=True)
    mock.get = AsyncMock(return_value=None)
    mock.delete = AsyncMock(return_value=1)
    mock.exists = AsyncMock(return_value=False)
    return mock


@pytest.fixture
def mock_openai_response() -> dict[str, Any]:
    """提供标准的OpenAI响应fixture"""
    return {
        "id": fake.uuid4(),
        "object": "chat.completion",
        "created": fake.unix_time(),
        "model": "gpt-4o-mini",
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": fake.text(max_nb_chars=100),
                },
                "finish_reason": "stop",
            }
        ],
    }


@pytest.fixture
def mock_message_context() -> MagicMock:
    """提供mock的消息上下文"""
    mock = MagicMock()
    mock.init_context_messages = AsyncMock()
    mock.build = MagicMock(
        return_value=[
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there"},
        ]
    )
    return mock


@pytest.fixture
def mock_model_service_stream() -> AsyncMock:
    """提供mock的模型服务流式响应"""

    async def mock_stream(*args, **kwargs):
        # from app.services.chat.model import StreamChunk

        from app.services.chat.model import StreamChunk

        chunks = [
            StreamChunk(delta={"content": "Hello"}, finish_reason=None),
            StreamChunk(delta={"content": " world"}, finish_reason=None),
            StreamChunk(delta={}, finish_reason="stop"),
        ]
        for chunk in chunks:
            yield chunk

    return AsyncMock(side_effect=mock_stream)


@pytest.fixture
def mock_async_redis() -> MagicMock:
    """提供mock的异步Redis客户端"""
    mock = MagicMock()
    mock.set = AsyncMock(return_value=True)
    mock.delete = AsyncMock(return_value=1)
    mock.exists = AsyncMock(return_value=False)
    return mock


@pytest.fixture
def mock_stream_chunk() -> dict[str, Any]:
    """提供流式响应chunk fixture"""
    return {
        "id": fake.uuid4(),
        "object": "chat.completion.chunk",
        "created": fake.unix_time(),
        "model": "gpt-4o-mini",
        "choices": [
            {
                "index": 0,
                "delta": {"content": fake.text(max_nb_chars=20)},
                "finish_reason": None,
            }
        ],
    }


@pytest.fixture
def mock_tool_manager() -> MagicMock:
    """提供mock的工具管理器"""
    mock = MagicMock()
    mock.get_tools_schema = MagicMock(return_value=[])
    mock.execute_tool = AsyncMock(return_value={"result": "success"})
    mock.has_tool = MagicMock(return_value=True)
    return mock


@pytest.fixture
def mock_model_service() -> MagicMock:
    """提供mock的模型服务"""
    mock = MagicMock()
    mock.chat_completion_stream = AsyncMock()
    return mock
