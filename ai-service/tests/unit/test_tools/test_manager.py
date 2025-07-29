"""
测试工具管理器
"""

import pytest

from app.tools.manager import ToolManager, get_tool_manager, init_tool_manager


class TestToolManager:
    """测试ToolManager类"""

    def test_register_tool_success(self):
        """测试成功注册工具"""
        manager = ToolManager()

        def test_func(query: str) -> str:
            return f"Result for {query}"

        schema = {
            "type": "function",
            "function": {
                "name": "test_tool",
                "description": "A test tool",
                "parameters": {
                    "type": "object",
                    "properties": {"query": {"type": "string"}},
                    "required": ["query"],
                },
            },
        }

        manager.register_tool("test_tool", test_func, schema)

        assert manager.has_tool("test_tool")
        assert len(manager.get_tools_schema()) == 1
        assert manager.get_tools_schema()[0]["function"]["name"] == "test_tool"

    def test_register_tool_duplicate(self):
        """测试重复注册工具"""
        manager = ToolManager()

        def test_func(query: str) -> str:
            return f"Result for {query}"

        schema = {
            "type": "function",
            "function": {"name": "test_tool", "description": "A test tool"},
        }

        manager.register_tool("test_tool", test_func, schema)
        manager.register_tool("test_tool", test_func, schema)  # 重复注册

        # 应该只保留一个schema
        assert len(manager.get_tools_schema()) == 1

    def test_unregister_tool_success(self):
        """测试成功注销工具"""
        manager = ToolManager()

        def test_func(query: str) -> str:
            return f"Result for {query}"

        schema = {
            "type": "function",
            "function": {"name": "test_tool", "description": "A test tool"},
        }

        manager.register_tool("test_tool", test_func, schema)
        result = manager.unregister_tool("test_tool")

        assert result is True
        assert not manager.has_tool("test_tool")
        assert len(manager.get_tools_schema()) == 0

    def test_unregister_nonexistent_tool(self):
        """测试注销不存在的工具"""
        manager = ToolManager()

        result = manager.unregister_tool("nonexistent")

        assert result is False

    @pytest.mark.asyncio
    async def test_execute_tool_sync(self):
        """测试执行同步工具"""
        manager = ToolManager()

        def sync_func(query: str) -> str:
            return f"Sync result for {query}"

        schema = {
            "type": "function",
            "function": {"name": "sync_tool", "description": "A sync tool"},
        }

        manager.register_tool("sync_tool", sync_func, schema)
        result = await manager.execute_tool("sync_tool", {"query": "test"})

        assert result == "Sync result for test"

    @pytest.mark.asyncio
    async def test_execute_tool_async(self):
        """测试执行异步工具"""
        manager = ToolManager()

        async def async_func(query: str) -> str:
            return f"Async result for {query}"

        schema = {
            "type": "function",
            "function": {"name": "async_tool", "description": "An async tool"},
        }

        manager.register_tool("async_tool", async_func, schema)
        result = await manager.execute_tool("async_tool", {"query": "test"})

        assert result == "Async result for test"

    def test_list_tools(self):
        """测试列出所有工具"""
        manager = ToolManager()

        def func1():
            pass

        def func2():
            pass

        manager.register_tool(
            "tool1", func1, {"type": "function", "function": {"name": "tool1"}}
        )
        manager.register_tool(
            "tool2", func2, {"type": "function", "function": {"name": "tool2"}}
        )

        tools = manager.list_tools()
        assert len(tools) == 2
        assert "tool1" in tools
        assert "tool2" in tools

    def test_clear_all_tools(self):
        """测试清除所有工具"""
        manager = ToolManager()

        def test_func():
            pass

        manager.register_tool(
            "test", test_func, {"type": "function", "function": {"name": "test"}}
        )
        manager.clear_all_tools()

        assert len(manager.list_tools()) == 0
        assert len(manager.get_tools_schema()) == 0


class TestToolManagerGlobal:
    """测试全局工具管理器"""

    def test_init_tool_manager(self):
        """测试初始化工具管理器"""
        # 确保是新的实例
        ToolManager._tool_manager = None

        manager = init_tool_manager()
        assert isinstance(manager, ToolManager)

        # 再次初始化应该返回相同实例
        manager2 = init_tool_manager()
        assert manager is manager2

    def test_get_tool_manager_not_initialized(self):
        """测试获取未初始化的工具管理器"""
        # 确保未初始化 - 需要重置全局状态
        import app.tools.manager as manager_module

        # 保存原始值
        original = manager_module._tool_manager
        try:
            manager_module._tool_manager = None
            with pytest.raises(RuntimeError, match="工具管理器尚未初始化"):
                get_tool_manager()
        finally:
            # 恢复原始值
            manager_module._tool_manager = original

    def test_get_tool_manager_initialized(self):
        """测试获取已初始化的工具管理器"""
        manager = init_tool_manager()
        retrieved = get_tool_manager()

        assert manager is retrieved
