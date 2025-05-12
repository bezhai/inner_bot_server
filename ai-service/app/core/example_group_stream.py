"""
分组顺序消费模式（Group Stream）示例

统一使用 subscribe 注册所有事件处理函数，通过 register_group/unregister_group 管理分组消费状态
"""

from app.core.event_system import (
    get_event_system, 
    register_group,
    unregister_group,
    publish_group_event,
)

# 注册处理函数方式 - 使用 subscribe
# ====================================
async def handle_order_created(data):
    """处理订单创建事件"""
    print(f"收到订单创建事件: {data}")
    # 处理订单...
    return {"status": "processed"}

async def handle_order_refunded(data):
    """处理订单退款事件"""
    print(f"收到订单退款事件: {data}")
    # 处理退款...
    return {"status": "refunded"}

# 注册处理函数
get_event_system().subscribe("order.created", handle_order_created)
get_event_system().subscribe("order.refunded", handle_order_refunded)

# 使用示例
# ====================================
async def start_order_processing():
    """启动订单处理"""
    # 1. 注册分组（对应用户ID为123的订单事件）
    await register_group("order.created", "user_123")
    await register_group("order.refunded", "user_123")
    print("已启动用户123的订单处理")
    
    # 2. 发布订单创建事件
    order_data = {
        "id": "ORD-001",
        "user_id": "user_123",
        "amount": 99.99,
        "items": ["item1", "item2"]
    }
    await publish_group_event("order.created", "user_123", order_data)
    print(f"已发布订单创建事件: {order_data}")
    
    # 稍后可以停止处理
    # await stop_order_processing()
    
async def stop_order_processing():
    """停止订单处理"""
    await unregister_group("order.created", "user_123")
    await unregister_group("order.refunded", "user_123")
    print("已停止用户123的订单处理") 