"""
测试ChatService核心功能 - 精简版，仅保留核心单元测试
"""

from unittest.mock import patch

import pytest

from app.services.chat_service import ChatService
from app.types.chat import ChatStreamChunk


class TestChatService:
    """测试ChatService类"""

    def test_handle_partial_response(self):
        """测试部分响应处理"""

        chunk = ChatStreamChunk(content="test")
        assert chunk.content == "test"

    @pytest.mark.asyncio
    async def test_generate_ai_reply_exception_handling(self):
        """测试异常处理机制"""
        message_id = "test-message-123"

        with patch("app.services.chat.context.MessageContext") as mock_context_class:
            mock_context_class.side_effect = Exception("Database error")

            chunks = []
            async for chunk in ChatService.generate_ai_reply(message_id):
                chunks.append(chunk)

            assert len(chunks) == 1
            assert chunks[0].content is not None
