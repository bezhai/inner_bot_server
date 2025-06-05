# AI工具系统

基于装饰器的AI工具注册和管理系统，支持自动schema生成、类型安全的参数处理、异步/同步函数支持以及Pydantic模型集成。

## 特性

- **装饰器注册**: 使用`@tool`装饰器自动注册工具函数
- **自动Schema生成**: 从函数签名和文档字符串自动生成OpenAI工具调用schema
- **类型安全**: 基于Python类型注解进行参数验证
- **Pydantic集成**: 支持复杂的Pydantic模型参数
- **异步支持**: 同时支持同步和异步工具函数
- **类方法支持**: 支持类方法作为工具，自动实例绑定

## 基本用法

### 简单函数工具

```python
from app.tools import tool

@tool(description="获取当前时间")
def get_current_time() -> str:
    """获取当前日期和时间"""
    from datetime import datetime
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

@tool(description="计算数学表达式")
def calculate(expression: str) -> float:
    """
    计算数学表达式
    
    Args:
        expression: 要计算的数学表达式，如 "2+3*4"
        
    Returns:
        计算结果
    """
    return eval(expression)
```

### 使用Pydantic模型

```python
from pydantic import BaseModel, Field
from app.tools import tool

class WeatherQuery(BaseModel):
    city: str = Field(description="城市名称")
    units: str = Field(default="celsius", description="温度单位")

@tool(description="获取天气信息")
async def get_weather(query: WeatherQuery) -> str:
    """获取指定城市的天气信息"""
    # 实际实现会调用天气API
    return f"{query.city}的温度是25°{query.units}"
```

### 类方法工具

```python
from app.tools import tool, ToolProvider

class WeatherService(ToolProvider):
    def __init__(self, api_key: str):
        self.api_key = api_key
        super().__init__()  # 必须调用，触发工具注册
    
    @tool(description="获取详细天气")
    async def get_detailed_weather(self, city: str, days: int = 1) -> dict:
        """
        获取多天天气预报
        
        Args:
            city: 城市名称
            days: 预报天数
            
        Returns:
            天气预报数据
        """
        return {"city": city, "forecast": f"{days}天预报"}

# 实例化时自动注册工具
weather_service = WeatherService("your-api-key")
```

### 手动注册实例

```python
from app.tools import register_instance

class MyService:
    @tool(description="处理数据")
    def process_data(self, data: str) -> str:
        return f"处理: {data}"

# 手动注册
service = register_instance(MyService())
```

## 系统集成

工具系统已集成到应用启动流程中，无需手动初始化：

```python
# main.py 中已经包含
from app.tools.startup import startup_tools

@asynccontextmanager
async def lifespan(app: FastAPI):
    await startup_tools()  # 自动启动工具系统
    yield
```

## 使用工具

```python
from app.tools import get_tool_manager

# 获取工具管理器
tool_manager = get_tool_manager()

# 列出所有工具
tools = tool_manager.list_tools()

# 获取工具schema
schemas = tool_manager.get_tools_schema()

# 执行工具
result = await tool_manager.execute_tool("calculate", {"expression": "2+3"})
```

## 内置工具

系统提供以下内置工具：

- `get_current_time`: 获取当前时间
- `get_current_date`: 获取当前日期  
- `calculate`: 数学表达式计算
- `analyze_text`: 文本统计分析
- `search_web`: 网络搜索（示例）
- `convert_data_format`: 数据格式转换
- `get_tool_help`: 获取工具帮助

## 最佳实践

1. **函数文档**: 使用详细的docstring，包含Args和Returns部分
2. **类型注解**: 为所有参数添加类型注解
3. **错误处理**: 在工具函数中处理可能的异常
4. **参数验证**: 使用Pydantic模型进行复杂参数验证
5. **异步优先**: 对于I/O密集型操作使用异步函数

## 调试和监控

```python
from app.tools.registry import get_tools_summary

# 获取系统状态
summary = get_tools_summary()
print(f"已注册工具数量: {summary['registered_tools_count']}")
print(f"可用工具: {summary['registered_tools']}")
```
