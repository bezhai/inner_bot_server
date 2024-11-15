from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from app.ai import get_ai_response

app = FastAPI()

# 定义请求体结构
class ChatRequest(BaseModel):
    model: str
    messages: list
    temperature: float = 0.7
    stream: bool = False

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
        # 调用 AI 模型获取响应
        if request.stream:
            # 如果需要流式响应，返回 StreamingResponse
            event_generator = await get_ai_response(
                model=request.model,
                messages=request.messages,
                temperature=request.temperature,
                stream=True
            )
            return StreamingResponse(event_generator, media_type="application/json")
        else:
            # 否则返回完整的响应
            completion = await get_ai_response(
                model=request.model,
                messages=request.messages,
                temperature=request.temperature,
                stream=False
            )
            return JSONResponse(content=completion.model_dump())
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})