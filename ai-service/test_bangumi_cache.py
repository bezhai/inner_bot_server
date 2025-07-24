#!/usr/bin/env python3
"""
测试Bangumi API缓存功能
"""
import asyncio
import time
from app.agents.bangumi.tools import send_bangumi_request

async def test_cache():
    """测试缓存功能"""
    print("测试Bangumi API缓存功能")
    print("=" * 50)
    
    # 测试参数
    test_path = "/v0/search/subjects"
    test_params = {"limit": 5}
    test_data = {"keyword": "进击的巨人", "sort": "match"}
    
    print(f"请求参数: path={test_path}, params={test_params}, data={test_data}")
    print()
    
    # 第一次请求 - 应该缓存未命中
    print("第一次请求 (应该缓存未命中):")
    start_time = time.time()
    result1 = await send_bangumi_request(
        path=test_path,
        params=test_params,
        method="POST",
        data=test_data
    )
    first_request_time = time.time() - start_time
    print(f"请求耗时: {first_request_time:.2f}秒")
    print(f"返回结果条目数: {len(result1.get('data', []))}")
    print()
    
    # 第二次请求 - 应该缓存命中
    print("第二次请求 (应该缓存命中):")
    start_time = time.time()
    result2 = await send_bangumi_request(
        path=test_path,
        params=test_params,
        method="POST",
        data=test_data
    )
    second_request_time = time.time() - start_time
    print(f"请求耗时: {second_request_time:.2f}秒")
    print(f"返回结果条目数: {len(result2.get('data', []))}")
    print()
    
    # 验证缓存效果
    print("缓存效果分析:")
    print(f"第一次请求耗时: {first_request_time:.2f}秒")
    print(f"第二次请求耗时: {second_request_time:.2f}秒")
    
    if second_request_time < first_request_time * 0.1:  # 缓存应该快很多
        print("✅ 缓存生效！第二次请求明显更快")
    else:
        print("❌ 缓存可能未生效，两次请求耗时相近")
    
    # 验证结果一致性
    if result1 == result2:
        print("✅ 两次请求结果一致")
    else:
        print("❌ 两次请求结果不一致")

if __name__ == "__main__":
    asyncio.run(test_cache())
