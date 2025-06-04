"""
聊天相关API路由
"""
import traceback
from fastapi import APIRouter, Body
from fastapi.responses import StreamingResponse, JSONResponse
from sse_starlette.sse import EventSourceResponse

from app.services.service import ai_chat, parse_message_keywords, search_web
from app.services.gpt import ChatRequest
from app.services.meta_info import get_model_list
from app.services.chat_service import chat_service
from app.types.chat import NewChatRequest, Step, ChatNormalResponse
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/chat")
async def chat_completion(request: ChatRequest):
    """
    调用 AI 模型生成对话响应。

    :param request: 请求体，包含模型、消息、温度、是否流式等参数
    :return: 生成对话响应
    """
    try:
        completion = await ai_chat(request)
        if request.stream:
            # 如果需要流式响应，返回 StreamingResponse
            return StreamingResponse(completion, media_type="application/json")
        else:
            # 否则返回完整的响应
            return JSONResponse(content=completion.model_dump())
    except Exception as e:
        # 捕获完整的异常堆栈
        error_stack = traceback.format_exc()
        logger.error(f"聊天完成接口调用失败: {error_stack}")
        return JSONResponse(
            status_code=500, 
            content={"error": "Internal Server Error", "details": str(e)}
        )


@router.post("/search_with_ai")
async def search_with_ai(
    message: str = Body(..., embed=True)
):
    """
    智能搜索接口：
    1. 解析用户输入关键词
    2. 如需搜索则返回搜索结果
    """
    try:
        keywords_result = await parse_message_keywords(message)
        search_result = None
        if keywords_result.need_search and keywords_result.result:
            search_result = await search_web(keywords_result.result)
        return JSONResponse(content={
            "keywords": keywords_result.result,
            "need_search": keywords_result.need_search,
            "search": search_result.model_dump() if search_result else None
        })
    except Exception as e:
        error_stack = traceback.format_exc()
        logger.error(f"智能搜索接口调用失败: {error_stack}")
        return JSONResponse(
            status_code=500,
            content={"error": "Internal Server Error", "details": str(e)}
        )


@router.post("/chat/sse")
async def chat_sse(request: NewChatRequest):
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