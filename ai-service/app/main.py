import traceback
from fastapi import FastAPI
from fastapi.responses import StreamingResponse, JSONResponse
from app.service import ai_chat
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
        
@app.get("/model/list")
async def get_model_list():
    """
    获取所有可用的模型列表。
    :return: 模型列表
    """
    from app.meta_info import get_model_list
    model_list = await get_model_list()
    return JSONResponse(content=model_list)