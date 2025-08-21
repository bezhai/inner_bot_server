"""
测试话题总结工具
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.tools.topic_summary import topic_summary
from app.types.memory import ChatRecord, HistoryMessagesResponse


class TestTopicSummary:
    """话题总结工具测试类"""

    @pytest.mark.asyncio
    async def test_topic_summary_success(self):
        """测试话题总结成功"""
        # 创建模拟的历史消息数据
        mock_messages = [
            ChatRecord(
                user_name="用户1",
                content="今天天气怎么样？",
                create_time="2024-01-15 14:30:00",
                message_id="msg1",
                reply_message_id=None,
            ),
            ChatRecord(
                user_name="用户2",
                content="今天天气很好，阳光明媚",
                create_time="2024-01-15 14:31:00",
                message_id="msg2",
                reply_message_id="msg1",
            ),
        ]
        mock_history_response = HistoryMessagesResponse(
            messages=mock_messages, total_count=2
        )

        # Mock LLM response
        mock_llm_response = MagicMock()
        mock_llm_response.choices = [MagicMock()]
        mock_llm_response.choices[
            0
        ].message.content = "用户讨论了天气情况，用户1询问天气，用户2回复天气很好。"

        # Mock get_message_id
        with patch(
            "app.tools.topic_summary.get_message_id", return_value="test-msg-123"
        ):
            # Mock memory_client.history_messages
            with patch(
                "app.tools.topic_summary.memory_client.history_messages",
                new_callable=AsyncMock,
                return_value=mock_history_response,
            ):
                # Mock ModelService.get_openai_client (动态导入)
                with patch(
                    "app.services.chat.model.ModelService.get_openai_client",
                    new_callable=AsyncMock,
                ) as mock_get_client:
                    mock_client = AsyncMock()
                    mock_client.chat.completions.create.return_value = mock_llm_response
                    mock_get_client.return_value = mock_client

                    result = await topic_summary(
                        start_time="2024-01-15 14:30", end_time="2024-01-15 18:30"
                    )

                    assert "## 聊天记录总结" in result
                    assert "用户讨论了天气情况" in result
                    assert "消息总数**: 2" in result

    @pytest.mark.asyncio
    async def test_topic_summary_no_message_id(self):
        """测试无法获取message_id的情况"""
        with patch("app.tools.topic_summary.get_message_id", return_value=None):
            result = await topic_summary(
                start_time="2024-01-15 14:30", end_time="2024-01-15 18:30"
            )

            assert result == "无法获取当前消息ID，请重试"

    @pytest.mark.asyncio
    async def test_topic_summary_invalid_time_format(self):
        """测试无效时间格式"""
        with patch(
            "app.tools.topic_summary.get_message_id", return_value="test-msg-123"
        ):
            result = await topic_summary(
                start_time="invalid-time", end_time="2024-01-15 18:30"
            )

            assert "时间格式错误" in result

    @pytest.mark.asyncio
    async def test_topic_summary_invalid_time_range(self):
        """测试无效时间范围"""
        with patch(
            "app.tools.topic_summary.get_message_id", return_value="test-msg-123"
        ):
            # 结束时间早于开始时间
            result = await topic_summary(
                start_time="2024-01-15 18:30", end_time="2024-01-15 14:30"
            )

            assert result == "起始时间必须早于结束时间"

    @pytest.mark.asyncio
    async def test_topic_summary_time_range_too_long(self):
        """测试时间范围超过1天"""
        with patch(
            "app.tools.topic_summary.get_message_id", return_value="test-msg-123"
        ):
            result = await topic_summary(
                start_time="2024-01-15 14:30",
                end_time="2024-01-17 14:30",  # 超过1天
            )

            assert result == "时间范围不能超过1天（24小时）"

    @pytest.mark.asyncio
    async def test_topic_summary_empty_result(self):
        """测试空结果"""
        with patch(
            "app.tools.topic_summary.get_message_id", return_value="test-msg-123"
        ):
            with patch(
                "app.tools.topic_summary.memory_client.history_messages",
                new_callable=AsyncMock,
                return_value=None,
            ):
                result = await topic_summary(
                    start_time="2024-01-15 14:30", end_time="2024-01-15 18:30"
                )

                assert result == "未找到指定时间范围内的聊天消息"

    @pytest.mark.asyncio
    async def test_topic_summary_empty_messages(self):
        """测试消息列表为空"""
        mock_history_response = HistoryMessagesResponse(messages=[], total_count=0)

        with patch(
            "app.tools.topic_summary.get_message_id", return_value="test-msg-123"
        ):
            with patch(
                "app.tools.topic_summary.memory_client.history_messages",
                new_callable=AsyncMock,
                return_value=mock_history_response,
            ):
                result = await topic_summary(
                    start_time="2024-01-15 14:30", end_time="2024-01-15 18:30"
                )

                assert result == "未找到指定时间范围内的聊天消息"

    @pytest.mark.asyncio
    async def test_topic_summary_llm_failure(self):
        """测试LLM总结失败的情况"""
        # 创建模拟的历史消息数据
        mock_messages = [
            ChatRecord(
                user_name="用户1",
                content="测试消息",
                create_time="2024-01-15 14:30:00",
                message_id="msg1",
                reply_message_id=None,
            )
        ]
        mock_history_response = HistoryMessagesResponse(
            messages=mock_messages, total_count=1
        )

        with patch(
            "app.tools.topic_summary.get_message_id", return_value="test-msg-123"
        ):
            with patch(
                "app.tools.topic_summary.memory_client.history_messages",
                new_callable=AsyncMock,
                return_value=mock_history_response,
            ):
                # Mock ModelService.get_openai_client 抛出异常 (动态导入)
                with patch(
                    "app.services.chat.model.ModelService.get_openai_client",
                    new_callable=AsyncMock,
                    side_effect=Exception("LLM服务异常"),
                ):
                    result = await topic_summary(
                        start_time="2024-01-15 14:30", end_time="2024-01-15 18:30"
                    )

                    assert "LLM 总结失败" in result
                    assert "成功获取到 1 条消息" in result

    @pytest.mark.asyncio
    async def test_topic_summary_exception_handling(self):
        """测试异常处理"""
        with patch(
            "app.tools.topic_summary.get_message_id", return_value="test-msg-123"
        ):
            with patch(
                "app.tools.topic_summary.memory_client.history_messages",
                new_callable=AsyncMock,
                side_effect=Exception("测试异常"),
            ):
                result = await topic_summary(
                    start_time="2024-01-15 14:30", end_time="2024-01-15 18:30"
                )

                assert "话题总结失败: 测试异常" in result
