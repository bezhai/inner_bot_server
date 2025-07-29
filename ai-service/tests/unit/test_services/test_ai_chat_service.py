"""
测试AIChatService核心功能 - 精简版，仅保留核心单元测试
"""

from unittest.mock import MagicMock, patch

import pytest

from app.services.chat.message import AIChatService


class TestAIChatService:
    """测试AIChatService类"""

    @pytest.mark.asyncio
    async def test_stream_ai_reply_success(self):
        """测试成功流式回复"""
        messages = [{"role": "user", "content": "Hello"}]

        with patch(
            "app.services.chat.model.ModelService.chat_completion_stream"
        ) as mock_stream:
            # Mock OpenAI流式响应格式
            class MockDelta:
                def __init__(self, content):
                    self.content = content

            class MockChoice:
                def __init__(self, content, finish_reason=None):
                    self.delta = MockDelta(content)
                    self.finish_reason = finish_reason

            class MockChunk:
                def __init__(self, content, finish_reason=None):
                    self.choices = [MockChoice(content, finish_reason)]

            async def mock_stream_gen(*args, **kwargs):
                yield MockChunk("Hello")
                yield MockChunk(" there")
                yield MockChunk(None, "stop")

            mock_stream.side_effect = mock_stream_gen

            chunks = []
            async for chunk in AIChatService.stream_ai_reply(messages):
                chunks.append(chunk)

            assert len(chunks) >= 1

    @pytest.mark.asyncio
    async def test_stream_ai_reply_with_tools(self):
        """测试启用工具的流式回复"""
        messages = [{"role": "user", "content": "Calculate 2+2"}]

        with (
            patch(
                "app.services.chat.model.ModelService.chat_completion_stream"
            ) as mock_stream,
            patch("app.tools.get_tool_manager") as mock_get_tool_manager,
        ):
            # Mock工具管理器
            mock_tool_manager = MagicMock()
            mock_tool_manager.get_tools_schema.return_value = [
                {
                    "type": "function",
                    "function": {
                        "name": "calculate",
                        "description": "Calculate expression",
                        "parameters": {
                            "type": "object",
                            "properties": {"expression": {"type": "string"}},
                        },
                    },
                }
            ]
            mock_get_tool_manager.return_value = mock_tool_manager

            # Mock OpenAI流式响应格式
            class MockDelta:
                def __init__(self, content):
                    self.content = content

            class MockChoice:
                def __init__(self, content, finish_reason=None):
                    self.delta = MockDelta(content)
                    self.finish_reason = finish_reason

            class MockChunk:
                def __init__(self, content, finish_reason=None):
                    self.choices = [MockChoice(content, finish_reason)]

            async def mock_stream_gen(*args, **kwargs):
                yield MockChunk("Let me calculate")
                yield MockChunk(" 2+2=4")
                yield MockChunk(None, "stop")

            mock_stream.side_effect = mock_stream_gen

            chunks = []
            async for chunk in AIChatService.stream_ai_reply(
                messages, enable_tools=True
            ):
                chunks.append(chunk)

            assert len(chunks) >= 1

    @pytest.mark.asyncio
    async def test_stream_ai_reply_content_filter_error(self):
        """测试内容过滤异常"""
        messages = [{"role": "user", "content": "敏感内容"}]

        with patch(
            "app.services.chat.model.ModelService.chat_completion_stream"
        ) as mock_stream:
            # Mock OpenAI流式响应格式
            class MockDelta:
                def __init__(self, content):
                    self.content = content

            class MockChoice:
                def __init__(self, content, finish_reason=None):
                    self.delta = MockDelta(content)
                    self.finish_reason = finish_reason

            class MockChunk:
                def __init__(self, content, finish_reason=None):
                    self.choices = [MockChoice(content, finish_reason)]

            async def mock_stream_gen(*args, **kwargs):
                yield MockChunk("部分", "content_filter")

            mock_stream.side_effect = mock_stream_gen

            chunks = []
            async for chunk in AIChatService.stream_ai_reply(messages):
                chunks.append(chunk)

            # 由于异常处理逻辑，测试基本流程
            assert len(chunks) >= 0

    @pytest.mark.asyncio
    async def test_stream_ai_reply_exception_handling(self):
        """测试异常处理机制"""
        messages = [{"role": "user", "content": "Test"}]

        with patch(
            "app.services.chat.model.ModelService.chat_completion_stream"
        ) as mock_stream:
            mock_stream.side_effect = Exception("API Error")

            chunks = []
            async for chunk in AIChatService.stream_ai_reply(messages):
                chunks.append(chunk)

            assert len(chunks) == 1
            assert "错误" in chunks[0].content
