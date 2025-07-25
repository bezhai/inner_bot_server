"""
TraceId中间件 - 用于读取和传递X-Trace-Id
"""

import contextvars
import uuid
from collections.abc import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

# 创建context变量来存储traceId
trace_id_var: contextvars.ContextVar[str] = contextvars.ContextVar(
    "trace_id", default=None
)


class TraceIdMiddleware(BaseHTTPMiddleware):
    """
    TraceId中间件

    功能：
    1. 从HTTP请求头中读取X-Trace-Id
    2. 如果没有X-Trace-Id，则生成新的traceId
    3. 将traceId存储到上下文变量中供全局使用
    4. 在响应头中返回traceId
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # 从请求头中获取traceId
        trace_id = request.headers.get("X-Trace-Id")

        # 如果没有traceId，生成一个新的
        if not trace_id:
            trace_id = str(uuid.uuid4())

        # 将traceId存储到上下文变量中
        trace_id_var.set(trace_id)

        # 继续处理请求
        response = await call_next(request)

        # 在响应头中添加traceId
        response.headers["X-Trace-Id"] = trace_id

        return response


def get_trace_id() -> str:
    """
    获取当前请求的traceId

    Returns:
        str: 当前请求的traceId，如果不存在则返回None
    """
    return trace_id_var.get()
