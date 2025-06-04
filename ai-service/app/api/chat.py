"""
聊天相关API路由
"""
import traceback
from fastapi import APIRouter, Body, Request
from fastapi.responses import StreamingResponse, JSONResponse
from sse_starlette.sse import EventSourceResponse
import asyncio
from app.services.service import ai_chat, parse_message_keywords, search_web, Message
from app.services.gpt import ChatRequest
from app.services.meta_info import get_model_list
from app.types.chat import ChatRequest as NewChatRequest, Step, ChatProcessResponse, ChatNormalResponse
from app.orm.crud import create_formated_message
from datetime import datetime
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
        print(f"Error occurred: {error_stack}")  # 打印到控制台
        return JSONResponse(
            status_code=500, 
            content={"error": "Internal Server Error", "details": str(e)}
        )
        
@router.get("/model/list")
async def get_model_list_api():
    """
    获取所有可用的模型列表。
    :return: 模型列表
    """
    model_list = await get_model_list()
    return JSONResponse(content=model_list)

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
        logger.error(f"search_with_ai failed: {error_stack}")
        return JSONResponse(
            status_code=500,
            content={"error": "Internal Server Error", "details": str(e)}
        )

@router.post("/chat/sse")
async def chat_sse(request: NewChatRequest):
    """
    SSE 聊天接口，接收消息写入数据库，并依次推送 step。
    """
    async def event_generator():
        try:
            # 1. accept
            yield ChatNormalResponse(step=Step.ACCEPT).model_dump_json()
            await asyncio.sleep(0.5)

            # 写入数据库
            try:
                data = request.model_dump()
                # 将毫秒时间戳转换为datetime对象
                data["create_time"] = datetime.fromtimestamp(int(data["create_time"]) / 1000)
                await create_formated_message(data)
            except Exception as e:
                logger.error(f"写入数据库失败: {str(e)}\n{traceback.format_exc()}")
                yield ChatNormalResponse(step=Step.FAILED).model_dump_json()
                return

            # 2. start_reply
            yield ChatNormalResponse(step=Step.START_REPLY).model_dump_json()
            await asyncio.sleep(0.5)

            # 3. send
            try:
                # TODO: 这里应该调用 AI 服务生成回复
                yield ChatProcessResponse(step=Step.SEND, content="已收到消息\n测试").model_dump_json()
                await asyncio.sleep(0.5)

                # 4. success
                yield ChatNormalResponse(step=Step.SUCCESS).model_dump_json()
            except Exception as e:
                logger.error(f"生成回复失败: {str(e)}\n{traceback.format_exc()}")
                yield ChatNormalResponse(step=Step.FAILED).model_dump_json()
                return

            # 5. end
            yield ChatNormalResponse(step=Step.END).model_dump_json()

        except Exception as e:
            logger.error(f"SSE 处理失败: {str(e)}\n{traceback.format_exc()}")
            yield ChatNormalResponse(step=Step.FAILED).model_dump_json()

    try:
        return EventSourceResponse(
            event_generator(),
            media_type="text/event-stream"
        )
    except Exception as e:
        logger.error(f"创建 SSE 响应失败: {str(e)}\n{traceback.format_exc()}")
        return JSONResponse(
            status_code=500,
            content={
                "error": "Internal Server Error",
                "details": str(e),
                "traceback": traceback.format_exc()
            }
        ) 