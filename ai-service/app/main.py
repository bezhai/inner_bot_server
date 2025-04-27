import traceback
from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.api.router import api_router
from app.core.events import init_events

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    应用生命周期管理
    """
    # 启动事件
    await init_events()
    yield
    # 关闭事件
    from app.core.event_system import get_event_system
    try:
        event_system = get_event_system()
        await event_system.stop()
    except Exception as e:
        print(f"关闭事件系统时出错: {e}")

app = FastAPI(lifespan=lifespan)

# 注册API路由
app.include_router(api_router)
