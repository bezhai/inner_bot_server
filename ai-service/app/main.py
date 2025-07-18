from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.api.router import api_router
from app.core.events import init_events
from app.tools.startup import startup_tools
from app.utils.middlewares import TraceIdMiddleware
import logging

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    应用生命周期管理
    """
    # 启动事件系统
    await init_events()

    # 启动工具系统
    await startup_tools()

    # 初始化QDrant集合
    # await init_qdrant_collections()

    yield

    # 关闭事件
    from app.core.event_system import get_event_system

    try:
        event_system = get_event_system()
        await event_system.stop()
    except Exception as e:
        logger.error(f"关闭事件系统时出错: {e}")


app = FastAPI(lifespan=lifespan)

# 添加TraceId中间件
app.add_middleware(TraceIdMiddleware)

# 注册API路由
app.include_router(api_router)
