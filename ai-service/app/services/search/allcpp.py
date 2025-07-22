from typing import List, Optional
from app.tools.decorators import tool
from app.utils.decorators.log_decorator import log_io
import httpx
from pydantic import BaseModel


class CppSearchResult(BaseModel):
    event_url: str  # 活动链接
    name: str  # 活动名称
    type: str  # 活动类型
    tag: str  # 活动标签
    enter_time: str  # 活动开始时间
    end_time: str  # 活动结束时间
    wanna_go_count: int  # 想参加人数
    prov_name: str  # 省份
    city_name: str  # 城市
    area_name: str  # 地区
    enter_address: str  # 活动地址
    ended: bool  # 是否已结束
    is_online: bool  # 是否为线上


# 中间结果
class CppSearchMidSingleResult(BaseModel):
    id: int  # 活动id
    name: str  # 活动名称
    type: str  # 活动类型
    tag: str  # 活动标签
    enterTime: str  # 活动开始时间
    endTime: str  # 活动结束时间
    wannaGoCount: int  # 想参加人数
    provName: str  # 省份
    cityName: str  # 城市
    areaName: str  # 地区
    enterAddress: str  # 活动地址
    ended: bool  # 是否已结束
    isOnline: int  # 是否为线上


class CppSearchMidResult(BaseModel):
    total: int  # 总活动数
    list: List[CppSearchMidSingleResult]  # 活动列表


@tool()
@log_io
async def search_donjin_event(
    query: str,
    is_online: Optional[bool] = None,
    recent_days: Optional[int] = None,
    activity_status: Optional[str] = None,
    activity_type: Optional[str] = None,
    ticket_status: Optional[int] = None,
) -> List[CppSearchResult]:
    """
    搜索同人展活动, 返回结构化的活动列表

    Args:
        query: 搜索关键词
        is_online: 是否为线上活动, 默认不限制
        recent_days: 最近几天内的活动, 默认为全部
        activity_status: 活动状态, 默认不限制, 可选值: ongoing(未结束), ended(已结束), 优先级比recent_days高
        activity_type: 活动类型, 默认不限制, 可选值: "茶会", "综合同人展", "ONLY", "线上活动", "官方活动", "综合展", "同好包场"
        ticket_status: 售票状态, 默认不限制, 可选值: {"暂未开票":1, "即将开票":2, "正在售票":3, "售票结束":4, "站外售票":5}
    """
    url = "https://www.allcpp.cn/allcpp/event/eventMainListV2.do"

    if activity_status == "ongoing":
        recent_days = -1
    elif activity_status == "ended":
        recent_days = -2

    query = {
        "keyword": query,
        "is_online": is_online,
        "day": recent_days,
        "sort": 1,
        "page": 1,
        "page_size": 100,
        "ticketStatus": ticket_status,
        "type": {
            "茶会": 1,
            "综合同人展": 2,
            "ONLY": 3,
            "线上活动": 6,
            "官方活动": 7,
            "综合展": 8,
            "同好包场": 10,
        }.get(activity_type, None),
    }

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(url, params=query)
        response.raise_for_status()
        data = response.json()

    mid_result = CppSearchMidResult(data["result"])

    return [
        CppSearchResult(
            event_url=f"https://www.allcpp.cn/allcpp/event/event.do?event={item.id}",
            name=item.name,
            type=item.type,
            tag=item.tag,
            enter_time=item.enterTime,
            end_time=item.endTime,
            wanna_go_count=item.wannaGoCount,
            prov_name=item.provName,
            city_name=item.cityName,
            area_name=item.areaName,
            enter_address=item.enterAddress,
            ended=item.ended,
            is_online=item.isOnline == 1,
        )
        for item in mid_result.list
    ]
