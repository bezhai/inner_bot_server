"""
测试话题总结工具
"""

from unittest.mock import AsyncMock, patch

import pytest

from app.tools.topic_summary import topic_summary


class TestTopicSummary:
    """话题总结工具测试类"""

    @pytest.mark.asyncio
    async def test_topic_summary_success(self):
        """测试话题总结成功"""
        # Mock get_message_id
        with patch(
            "app.tools.topic_summary.get_message_id", return_value="test-msg-123"
        ):
            # Mock memory_client.topic_summary
            with patch(
                "app.tools.topic_summary.memory_client.topic_summary",
                new_callable=AsyncMock,
                return_value="这是一个测试总结",
            ):
                result = await topic_summary(
                    start_time="2024-01-15 14:30", end_time="2024-01-15 18:30"
                )

                assert result == "这是一个测试总结"

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
                "app.tools.topic_summary.memory_client.topic_summary",
                new_callable=AsyncMock,
                return_value="",
            ):
                result = await topic_summary(
                    start_time="2024-01-15 14:30", end_time="2024-01-15 18:30"
                )

                assert result == "未找到指定时间范围内的话题内容，或话题总结为空"

    @pytest.mark.asyncio
    async def test_topic_summary_exception_handling(self):
        """测试异常处理"""
        with patch(
            "app.tools.topic_summary.get_message_id", return_value="test-msg-123"
        ):
            with patch(
                "app.tools.topic_summary.memory_client.topic_summary",
                new_callable=AsyncMock,
                side_effect=Exception("测试异常"),
            ):
                result = await topic_summary(
                    start_time="2024-01-15 14:30", end_time="2024-01-15 18:30"
                )

                assert "话题总结失败: 测试异常" in result
