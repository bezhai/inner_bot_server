"""
API路由汇总
"""
from fastapi import APIRouter
from app.api.chat import router as chat_router
from app.api.extraction import router as extraction_router

# 创建主路由
api_router = APIRouter()

# 注册子路由
api_router.include_router(chat_router, tags=["Chat"])
api_router.include_router(extraction_router, tags=["Extraction"])

# 健康检查路由
@api_router.get("/")
async def root():
    return {"message": "FastAPI is running!"} 