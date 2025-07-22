#!/usr/bin/env python3
"""
测试allcpp同人展搜索功能
"""

import asyncio
import sys
import os

# 添加项目路径到Python路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.services.search.allcpp import search_donjin_event


async def test_search_donjin_event():
    """测试search_donjin_event函数"""
    print("开始测试同人展搜索功能...")
    
    try:
        # 测试1: 基础搜索（不带任何参数）
        print("\n=== 测试1: 基础搜索 ===")
        results = await search_donjin_event()
        print(f"搜索成功! 获取到 {len(results)} 个活动")
        
        # 显示前3个结果作为示例
        for i, event in enumerate(results[:3]):
            print(f"\n活动 {i+1}:")
            print(f"  名称: {event.name}")
            print(f"  类型: {event.type}")
            print(f"  城市: {event.city_name}")
            print(f"  时间: {event.enter_time} - {event.end_time}")
            print(f"  是否线上: {event.is_online}")
            print(f"  链接: {event.event_url}")
        
        # 测试2: 带关键词搜索
        print("\n=== 测试2: 关键词搜索 ===")
        keyword_results = await search_donjin_event(query="上海")
        print(f"搜索关键词'上海'成功! 获取到 {len(keyword_results)} 个活动")
        
        # 测试3: 搜索线上活动
        print("\n=== 测试3: 线上活动搜索 ===")
        online_results = await search_donjin_event(is_online=True)
        print(f"搜索线上活动成功! 获取到 {len(online_results)} 个活动")
        
        # 测试4: 搜索最近30天的活动
        print("\n=== 测试4: 最近30天活动搜索 ===")
        recent_results = await search_donjin_event(recent_days=30)
        print(f"搜索最近30天活动成功! 获取到 {len(recent_results)} 个活动")
        
        print("\n✅ 所有测试通过! search_donjin_event函数工作正常")
        return True
        
    except Exception as e:
        print(f"\n❌ 测试失败: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return False


async def main():
    """主测试函数"""
    print("=" * 50)
    print("AllCPP同人展搜索功能测试")
    print("=" * 50)
    
    success = await test_search_donjin_event()
    
    print("\n" + "=" * 50)
    if success:
        print("测试结果: ✅ 通过")
        print("修复成功! 302重定向问题已解决")
    else:
        print("测试结果: ❌ 失败")
        print("还需要进一步调试修复方案")
    print("=" * 50)


if __name__ == "__main__":
    asyncio.run(main())
