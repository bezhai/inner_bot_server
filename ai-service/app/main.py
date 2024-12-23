from fastapi import FastAPI
from fastapi.responses import StreamingResponse, JSONResponse
from app.service import get_ai_response
from app.gpt import ChatRequest

app = FastAPI()


@app.get("/")
async def root():
    return {"message": "FastAPI is running!"}


@app.post("/chat")
async def chat_completion(request: ChatRequest):
    """
    调用 AI 模型生成对话响应。

    :param request: 请求体，包含模型、消息、温度、是否流式等参数
    :return: 生成对话响应
    """
    
    try:
        completion = await get_ai_response(request)
        if request.stream:
            # 如果需要流式响应，返回 StreamingResponse
            return StreamingResponse(completion, media_type="application/json")
        else:
            # 否则返回完整的响应
            return JSONResponse(content=completion.model_dump())
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})