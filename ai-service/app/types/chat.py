from enum import Enum
from typing import Optional, Union
from pydantic import BaseModel

class Step(str, Enum):
    """
    接收到消息后，服务器返回的步骤
    Server step after receiving message
    """
    ACCEPT = 'accept'         # 收到消息 / Message received
    START_REPLY = 'start_reply'  # 开始回复消息 / Start replying
    SEND = 'send'             # 发送消息 / Message sent
    FAILED = 'failed'         # 回复失败 / Reply failed
    SUCCESS = 'success'       # 回复成功 / Reply succeeded
    END = 'end'               # 结束 / End

class NewChatRequest(BaseModel):
    """
    聊天消息
    Chat message request
    """
    user_id: str                # 用户id / User ID
    user_name: str              # 用户名 / User name
    content: str                # 转义成markdown的消息内容，包括图片等 / Markdown content (may include images)
    is_mention_bot: bool        # 是否@机器人 / Mention bot
    role: str                   # 角色: 'user' | 'assistant' / Role
    root_message_id: Optional[str] = None   # 根消息id / Root message ID
    reply_message_id: Optional[str] = None  # 回复消息的id / Reply message ID
    message_id: str             # 消息id / Message ID
    chat_id: str                # 聊天id / Chat ID
    chat_type: str              # 聊天类型: 'p2p' | 'group' / Chat type
    create_time: str            # 创建时间 / Creation time

class ChatProcessResponse(BaseModel):
    """
    聊天处理响应（带思维链内容）
    Chat process response (with reasoning content)
    """
    step: Step = Step.SEND      # 步骤 / Step
    reason_content: Optional[str] = None         # 思维链内容 / Reasoning content
    content: str   # 回复内容 / Reply content

class ChatNormalResponse(BaseModel):
    """
    聊天普通响应
    Chat normal response
    """
    step: Step                  # 步骤 / Step

ChatResponse = Union[ChatProcessResponse, ChatNormalResponse] 