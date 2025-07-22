#!/usr/bin/env python3
"""
测试 search_subjects 函数
"""

import sys
import os
import asyncio
import json

# 添加项目根目录到 Python 路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '.'))

from app.services.search.bangumi import search_subjects

async def test_search_subjects():
    """测试 search_subjects 函数"""
    print("=== 测试 search_subjects 函数 ===\n")
    
    # 测试参数
    test_params = {
        "start_date": "2025-07-01",
        "end_date": "2025-08-01", 
        "limit": 5,
        "sort": "rank",
        "min_rating": 7,
        "types": ["动画"]
    }
    
    print("测试参数:")
    print(json.dumps(test_params, ensure_ascii=False, indent=2))
    print()
    
    try:
        # 调用 search_subjects 函数
        print("正在调用 search_subjects 函数...")
        result = await search_subjects(**test_params)
        
        print("✅ 函数调用成功!")
        print()
        
        # 打印结果
        print("=== 搜索结果 ===")
        print(f"总数: {result.total}")
        print(f"分页限制: {result.limit}")
        print(f"分页偏移: {result.offset}")
        print(f"返回条目数: {len(result.data)}")
        print()
        
        # 打印每个条目的详细信息
        for i, subject in enumerate(result.data, 1):
            print(f"--- 条目 {i} ---")
            print(f"类型: {subject.type}")
            print(f"名称: {subject.name}")
            print(f"中文名: {subject.name_cn or '无'}")
            print(f"播出日期: {subject.date or '无'}")
            print(f"平台: {subject.platform or '无'}")
            print(f"评分: {subject.score or '无'}")
            if subject.summary:
                summary = subject.summary[:100] + "..." if len(subject.summary) > 100 else subject.summary
                print(f"简介: {summary}")
            if subject.tags:
                print(f"标签: {', '.join(subject.tags[:5])}")  # 只显示前5个标签
            print()
            
    except Exception as e:
        print(f"❌ 函数调用失败: {e}")
        import traceback
        traceback.print_exc()

async def main():
    """主函数"""
    print("开始测试 Bangumi search_subjects 功能\n")
    await test_search_subjects()
    print("🎉 测试完成!")

if __name__ == "__main__":
    asyncio.run(main())
