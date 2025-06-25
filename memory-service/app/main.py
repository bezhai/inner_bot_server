from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .api.memory import router as memory_router
import logging

# 配置日志
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

# 创建FastAPI应用
app = FastAPI(
    title="Memory Service",
    description="飞书闲聊记忆框架服务 / Feishu Chat Memory Framework Service",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(memory_router)


# 根路径
@app.get("/")
async def root():
    """
    根路径
    """
    return {"message": "Memory Service is running", "version": "1.0.0", "docs": "/docs"}


# 健康检查
@app.get("/health")
async def health():
    """
    健康检查
    """
    return {"status": "healthy"}
