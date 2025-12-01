"""
画像更新Agent
使用LLM + Tools方式分析消息并更新用户画像和群聊画像
"""

import logging
from datetime import datetime

from langchain.messages import HumanMessage

from app.agents.basic.agent import ChatAgent
from app.memory.profile_tools import PROFILE_TOOLS
from app.services.quick_search import QuickSearchResult
from app.utils.message_formatter import format_messages_with_user_ids

logger = logging.getLogger(__name__)


# 画像更新的系统提示词
PROFILE_UPDATE_SYSTEM_PROMPT = """你是一个用户画像和群聊画像分析助手。你的任务是根据群聊消息记录，提取和更新用户画像与群聊画像。

## 你的工具
你有以下工具可以使用：
1. read_user_profiles - 批量读取用户画像
2. update_user_profiles - 批量更新用户画像
3. read_group_profile - 读取群聊画像
4. update_group_profile_tool - 更新群聊画像

## 工作流程
1. 首先分析消息中涉及的用户ID列表
2. 调用 read_user_profiles 获取这些用户的现有画像
3. 调用 read_group_profile 获取群聊的现有画像
4. 分析消息内容，提取可以更新的画像信息
5. 调用 update_user_profiles 更新用户画像
6. 调用 update_group_profile_tool 更新群聊画像

## 用户画像应包含的信息（长期稳固的信息）
- gender: 性别
- age_range: 年龄段
- occupation: 职业
- personality: 性格总结
- interests: 兴趣爱好列表
- relationships: 与其他用户的关系（用user_id作为key）
- other_facts: 其他长期事实

## 群聊画像应包含的信息
- group_style: 群聊风格
- common_topics: 常见话题
- group_culture: 群文化特点
- member_dynamics: 成员互动特点
- other_facts: 其他长期事实

## 重要规则
1. 只提取长期稳固的信息，不要存储临时性事实（如"今天吃了什么"、"明天要去哪里"）
2. 如果从消息中无法提取任何有价值的画像信息，可以不进行更新
3. 更新是增量合并的，不会覆盖原有信息，所以只需要提供新发现的信息
4. 要注意区分用户间的对话关系，正确识别说话者
5. 如果用户在消息中透露了关于自己或他人的信息，都应该记录

当前群聊ID: {chat_id}
当前时间: {current_time}
"""


async def update_profiles_from_messages(
    chat_id: str,
    messages: list[QuickSearchResult],
) -> dict:
    """
    根据消息列表更新用户画像和群聊画像

    Args:
        chat_id: 群聊ID
        messages: 消息列表

    Returns:
        更新结果统计
    """
    if not messages:
        logger.info(f"消息列表为空，跳过画像更新: {chat_id}")
        return {"success": True, "message": "无消息需要处理"}

    try:
        # 格式化消息，同时提取user_id列表
        formatted_messages, user_ids = format_messages_with_user_ids(messages)

        if not formatted_messages:
            logger.info(f"格式化后消息为空，跳过画像更新: {chat_id}")
            return {"success": True, "message": "无有效消息"}

        # 构建消息内容
        messages_text = "\n".join(formatted_messages)
        user_prompt = f"""请分析以下群聊消息，提取并更新用户画像和群聊画像。

涉及的用户ID列表: {user_ids}

消息记录:
{messages_text}

请按照工作流程，先读取现有画像，分析消息，然后更新画像。如果没有发现任何可更新的长期稳固信息，可以不进行更新操作。"""

        # 创建Agent并运行
        agent = ChatAgent(
            prompt_id="profile_update",  # 需要在Langfuse中配置
            tools=PROFILE_TOOLS,
            model_id="gemini-2.5-flash-preview-09-2025",
        )

        # 使用自定义prompt变量
        result = await agent.run(
            messages=[HumanMessage(content=user_prompt)],
            prompt_vars={
                "chat_id": chat_id,
                "current_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            },
        )

        logger.info(f"画像更新完成: {chat_id}, 处理 {len(messages)} 条消息")

        return {
            "success": True,
            "chat_id": chat_id,
            "message_count": len(messages),
            "user_count": len(user_ids),
            "agent_response": str(result.content) if result.content else None,
        }

    except Exception as e:
        logger.error(f"画像更新失败 {chat_id}: {str(e)}")
        return {
            "success": False,
            "chat_id": chat_id,
            "error": str(e),
        }


async def update_profiles_simple(
    chat_id: str,
    messages: list[QuickSearchResult],
) -> dict:
    """
    简化版画像更新（不使用Agent，直接调用服务）
    用于测试或降级场景

    Args:
        chat_id: 群聊ID
        messages: 消息列表

    Returns:
        更新结果
    """
    # 这是一个简化实现，仅用于测试
    # 实际使用时应该使用 update_profiles_from_messages
    from app.memory.profile_service import get_group_profile, update_group_profile

    try:
        # 获取现有画像
        existing = await get_group_profile(chat_id)

        # 简单统计
        user_count = len(set(msg.user_id for msg in messages if msg.role == "user"))
        message_count = len(messages)

        # 更新基本统计信息
        updates = {
            "last_activity": datetime.now().isoformat(),
            "recent_message_count": message_count,
            "recent_active_users": user_count,
        }

        await update_group_profile(chat_id, updates, merge=True)

        return {
            "success": True,
            "chat_id": chat_id,
            "message_count": message_count,
            "mode": "simple",
        }

    except Exception as e:
        logger.error(f"简化画像更新失败 {chat_id}: {str(e)}")
        return {"success": False, "error": str(e)}
