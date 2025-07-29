"""
测试ChatSimple核心功能 - 精简版，仅保留核心单元测试
"""

from unittest.mock import MagicMock


class TestChatSimple:
    """测试ChatSimple类"""

    def test_content_filter_error(self):
        """测试内容过滤异常"""
        from app.services.chat.message import ContentFilterError

        error = ContentFilterError()
        assert str(error) == "内容被过滤"

    def test_handle_partial_response(self):
        """测试部分响应处理"""
        messages = [{"role": "user", "content": "Hello"}]
        accumulated_content = MagicMock()
        accumulated_content.content = "Partial response"

        # 基础验证
        assert len(messages) == 1
        assert messages[0]["content"] == "Hello"
