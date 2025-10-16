import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI

from app.api.router import api_router
from app.services.qdrant import init_qdrant_collections
from app.utils.middlewares import HeaderContextMiddleware

load_dotenv()

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    应用生命周期管理
    """
    await init_qdrant_collections()

    yield

    # pass


app = FastAPI(lifespan=lifespan)

# 添加TraceId中间件
app.add_middleware(HeaderContextMiddleware)

# 注册API路由
app.include_router(api_router)
