#!/usr/bin/env python3
"""
API测试脚本
"""

import requests
import json
from datetime import datetime

# 服务器地址
BASE_URL = "http://localhost:8000"


def test_health():
    """测试健康检查接口"""
    print("🧪 测试健康检查接口...")
    response = requests.get(f"{BASE_URL}/health")
    print(f"状态码: {response.status_code}")
    print(f"响应: {response.json()}")
    print()


def test_store_message():
    """测试消息存储接口"""
    print("🧪 测试消息存储接口...")

    message_data = {
        "user_id": "user123",
        "user_name": "张三",
        "content": "你好，这是一条测试消息",
        "is_mention_bot": True,
        "role": "user",
        "root_message_id": "root123",
        "reply_message_id": None,
        "message_id": "msg123",
        "chat_id": "chat123",
        "chat_type": "group",
        "create_time": datetime.now().isoformat(),
    }

    response = requests.post(f"{BASE_URL}/api/v1/memory/message", json=message_data)
    print(f"状态码: {response.status_code}")
    print(f"响应: {response.json()}")
    print()


def test_quick_search():
    """测试快速检索接口"""
    print("🧪 测试快速检索接口...")

    search_data = {
        "chat_id": "chat123",
        "user_id": "user123",
        "user_name": "张三",
        "query": "测试查询",
        "max_results": 5,
    }

    response = requests.post(f"{BASE_URL}/api/v1/memory/quick_search", json=search_data)
    print(f"状态码: {response.status_code}")
    print(f"响应: {response.json()}")
    print()


def test_topic_search():
    """测试主题检索接口"""
    print("🧪 测试主题检索接口...")

    search_data = {
        "chat_id": "chat123",
        "user_id": "user123",
        "user_name": "张三",
        "query": "主题搜索测试",
        "include_original_messages": True,
        "max_results": 3,
    }

    response = requests.post(f"{BASE_URL}/api/v1/memory/topic_search", json=search_data)
    print(f"状态码: {response.status_code}")
    print(f"响应: {response.json()}")
    print()


def main():
    """主函数"""
    print("🚀 开始API测试...")
    print("=" * 50)

    try:
        test_health()
        test_store_message()
        test_quick_search()
        test_topic_search()

        print("✅ 所有测试完成!")

    except requests.exceptions.ConnectionError:
        print("❌ 无法连接到服务器，请确保服务正在运行")
        print("启动服务: uv run uvicorn app.main:app --host 0.0.0.0 --port 8000")
    except Exception as e:
        print(f"❌ 测试过程中出现错误: {e}")


if __name__ == "__main__":
    main()
