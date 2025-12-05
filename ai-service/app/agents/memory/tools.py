import json
import logging
from typing import Annotated, Any

from langchain.tools import tool
from langgraph.runtime import get_runtime
from pydantic import BaseModel, Field

from app.agents.basic.context import ContextSchema
from app.orm import crud

logger = logging.getLogger(__name__)


def _safe_json(data: Any) -> str:
    """
    将数据转换为 JSON 字符串
    """
    return json.dumps(data, ensure_ascii=False, default=str)


class UserProfileUpdateItem(BaseModel):
    """用户画像更新项结构"""

    user_id: str = Field(..., description="用户的唯一标识 user_id")
    profile: str = Field(
        ...,
        description="用户画像的具体内容，一段 markdown 文本",
    )


@tool
async def get_profiles(
    user_ids: Annotated[
        list[str],
        Field(description="需要查询的 user_id 列表，例如 ['u1', 'u2']"),
    ],
) -> str:
    """
    根据用户 ID 列表批量读取用户画像和当前群聊的画像(不需要传群组 id)。
    返回画像字典：{user_id: profile}
    """
    try:
        context = get_runtime(ContextSchema).context
        assert context.user_id_map is not None, "user_id_map is None in context"
        # 去重并过滤空字符串
        unique_ids = sorted(
            {
                context.user_id_map.inverse[uid]
                for uid in user_ids
                if uid and uid in context.user_id_map.inverse
            }
        )
        user_profiles = await crud.fetch_user_profiles(unique_ids)

        user_profiles = {
            context.user_id_map[uid]: profile for uid, profile in user_profiles.items()
        }

        assert context.curr_chat_id is not None, "curr_chat_id is None in context"
        profile = await crud.fetch_group_profile(context.curr_chat_id)

        return _safe_json(
            {"user_profiles": user_profiles, "group_profile": profile or {}}
        )
    except Exception as e:
        logger.error(f"batch_get_user_profiles failed: {e}")
        return f"Error: {str(e)}"


@tool
async def update_profiles(
    user_profiles: Annotated[
        list[UserProfileUpdateItem],
        Field(description="包含 user_id 和 profile 的对象列表"),
    ],
    group_profile: Annotated[
        str | None,
        Field(description="完整的群聊画像 markdown 文本"),
    ] = None,
) -> str:
    """
    批量更新用户画像及更新当前群聊画像。
    如果用户不存在则创建，存在则更新 profile 和 updated_at。
    """
    try:
        context = get_runtime(ContextSchema).context
        assert context.user_id_map is not None, "user_id_map is None in context"
        normalized: list[tuple[str, str | None]] = [
            (context.user_id_map.inverse[item.user_id], item.profile)
            for item in user_profiles
            if item.user_id in context.user_id_map.inverse
        ]

        await crud.upsert_user_profiles(normalized)
        logger.info("Upsert user profiles count: %d", len(normalized))

        if group_profile is not None:
            assert context.curr_chat_id is not None, "curr_chat_id is None in context"
            await crud.upsert_group_profile(context.curr_chat_id, group_profile)
            logger.info("Upsert group profile: %s", context.curr_chat_id)

        return "update success"

    except Exception as e:
        logger.error(f"batch_upsert_user_profiles failed: {e}")
        return f"Error executing update: {str(e)}"


PROFILE_TOOLS = [
    get_profiles,
    update_profiles,
]
