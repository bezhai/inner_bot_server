import httpx
from langchain.tools import tool

from app.config import settings
from app.utils.decorators import dict_serialize, log_io


@tool
@log_io
@dict_serialize
async def search_web(
    query: str,
    gl: str = "cn",
    engine: str = "google_light",
    hl: str = "zh-cn",
    num: int | None = None,
    page: int | None = None,
) -> dict:
    """Serp 搜索，支持多种轻量引擎。

    Args:
        query: 搜索关键词；在 ``google_lens`` 模式下表示图片 URL。
        gl: 结果地域代码（SerpAPI 的 ``gl``），默认 "cn"。
        engine: 搜索引擎类型，支持：
            - "google_light": 轻量级 Google 网页搜索
            - "google_images_light": 轻量级 Google 图片搜索
            - "google_lens": Google Lens 图片识别搜索（使用图片 URL）
        hl: 界面语言代码（SerpAPI 的 ``hl``），默认 "zh-cn"。
        num: 返回结果条数（SerpAPI 的 ``num``）。
        page: 页码/偏移控制，按 SerpAPI 逻辑近似映射：
            - google_light: 映射为 ``start=(page-1)*num``（num 为空时按 10 处理）
            - google_images_light: 映射为 ``ijn=page-1``
            - 其他 engine: 直接透传为 ``page`` 参数
    """
    url = "https://api.302.ai/serpapi/search"

    params: dict[str, str | int] = {
        "engine": engine,
        "api_key": settings.search_api_key or "",
        "hl": hl,
        "gl": gl,
    }

    # google_lens 使用图片 URL 参数 `url`，其余使用文本查询参数 `q`
    if engine == "google_lens":
        params["url"] = query
    else:
        params["q"] = query

    # 结果数量控制
    if num is not None and num > 0:
        params["num"] = num

    # 分页控制：根据不同 engine 做近似映射
    if page is not None and page > 1:
        if engine == "google_light":
            # Google Web: 使用 start 偏移，start = (page-1)*num
            effective_num = num if num is not None and num > 0 else 10
            params["start"] = (page - 1) * effective_num
        elif engine == "google_images_light":
            # Google Images: SerpAPI 使用 ijn 作为 0-based 页码
            params["ijn"] = page - 1
        else:
            # 其他 engine：直接透传 page，交给后端处理
            params["page"] = page

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
        data = response.json()

    return data
