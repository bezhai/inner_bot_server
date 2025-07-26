import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.agents import *
from app.api.router import api_router
from app.tools.startup import startup_tools
from app.utils.middlewares import TraceIdMiddleware

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    应用生命周期管理
    """

    # 启动工具系统
    await startup_tools()

    yield

    pass


app = FastAPI(lifespan=lifespan)

# 添加TraceId中间件
app.add_middleware(TraceIdMiddleware)

# 注册API路由
app.include_router(api_router)
