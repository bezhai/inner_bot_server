"""
聊天相关API路由
"""
import traceback
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse

from app.services.chat_service import chat_service
from app.types.chat import ChatRequest
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/chat/sse")
async def chat_sse(request: ChatRequest):
    """
    SSE 聊天接口，接收消息并通过服务端推送事件返回处理步骤。
    
    Args:
        request: 聊天请求对象
        
    Returns:
        EventSourceResponse: SSE 响应流
    """
    try:
        return EventSourceResponse(
            chat_service.process_chat_sse(request),
            media_type="text/event-stream"
        )
    except Exception as e:
        logger.error(f"创建 SSE 响应失败: {str(e)}\n{traceback.format_exc()}")
        return JSONResponse(
            status_code=500,
            content={
                "error": "Internal Server Error",
                "details": str(e)
            }
        ) 