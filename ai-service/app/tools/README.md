# AI工具系统

基于装饰器的AI工具注册和管理系统，支持自动schema生成、类型安全的参数处理、异步/同步函数支持以及Pydantic模型集成。

## 特性

- **装饰器注册**: 使用`@tool`装饰器自动注册工具函数
- **自动Schema生成**: 从函数签名和文档字符串自动生成OpenAI工具调用schema
- **类型安全**: 基于Python类型注解进行参数验证
- **Pydantic集成**: 支持复杂的Pydantic模型参数
- **异步支持**: 同时支持同步和异步工具函数
- **类方法支持**: 支持类方法作为工具，自动实例绑定
- **弱引用管理**: 使用弱引用字典避免内存泄漏
- **灵活注册**: 支持手动注册和自动注册两种方式

## 架构组件

### 核心模块

- `decorators.py`: 工具装饰器和基类实现
- `manager.py`: 工具管理器，负责注册、执行和管理工具
- `schema_generator.py`: 自动生成OpenAI工具调用schema
- `registry.py`: 工具注册中心，管理待注册工具列表
- `builtin_tools.py`: 内置工具集合
- `startup.py`: 系统启动和初始化

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
    days: int = Field(default=1, description="预报天数")

@tool(description="获取天气信息")
async def get_weather(query: WeatherQuery) -> str:
    """获取指定城市的天气信息"""
    # 实际实现会调用天气API
    return f"{query.city}的{query.days}天天气预报，温度单位：{query.units}"
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
        return {
            "city": city, 
            "forecast": f"{days}天预报",
            "api_key": self.api_key[:4] + "****"  # 部分显示API密钥
        }

# 实例化时自动注册工具
weather_service = WeatherService("your-api-key")
```

### 手动注册实例

```python
from app.tools import register_instance

class MyService:
    def __init__(self, config: dict):
        self.config = config
    
    @tool(description="处理数据")
    def process_data(self, data: str) -> str:
        """处理输入数据"""
        return f"用配置 {self.config} 处理: {data}"

# 手动注册实例
service = register_instance(MyService({"key": "value"}))
```

## 高级功能

### 工具启用/禁用

```python
@tool(description="测试工具", enabled=False)  # 禁用工具
def test_function():
    """这个工具将不会被注册"""
    pass

@tool(name="custom_name", description="自定义名称工具")
def my_function():
    """使用自定义名称注册工具"""
    pass
```

### 错误处理和安全性

```python
@tool(description="安全的计算工具")
def safe_calculate(expression: str) -> str:
    """
    安全的数学表达式计算
    
    Args:
        expression: 数学表达式
        
    Returns:
        计算结果或错误信息
    """
    try:
        # 限制可用的函数和变量
        allowed_names = {
            "abs": abs, "round": round, "min": min, "max": max,
            "pi": 3.14159, "e": 2.71828
        }
        
        # 安全计算
        result = eval(expression, {"__builtins__": {}}, allowed_names)
        return str(result)
        
    except Exception as e:
        return f"计算错误: {str(e)}"
```

## 系统集成

### 应用启动

工具系统已集成到应用启动流程中：

```python
# main.py 中的集成示例
from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.tools.startup import startup_tools

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动工具系统
    success = await startup_tools()
    if not success:
        raise RuntimeError("工具系统启动失败")
    yield

app = FastAPI(lifespan=lifespan)
```

### 工具管理器API

```python
from app.tools import get_tool_manager

# 获取工具管理器
tool_manager = get_tool_manager()

# 列出所有工具
tools = tool_manager.list_tools()
print(f"可用工具: {tools}")

# 获取工具schema（用于OpenAI函数调用）
schemas = tool_manager.get_tools_schema()

# 检查工具是否存在
if tool_manager.has_tool("calculate"):
    print("计算工具可用")

# 执行工具
result = await tool_manager.execute_tool("calculate", {"expression": "2+3*4"})
print(f"计算结果: {result}")

# 获取工具详细信息
info = tool_manager.get_tool_info("calculate")
if info:
    print(f"工具信息: {info}")

# 注销工具
success = tool_manager.unregister_tool("calculate")
print(f"注销结果: {success}")
```

## 内置工具

当前系统提供以下内置工具：

### 数学计算工具

- `calculate(expression: str)`: 安全的数学表达式计算
  - 支持基本运算符：`+`, `-`, `*`, `/`, `**`, `%`
  - 支持数学函数：`abs`, `round`, `min`, `max`, `sum`, `pow`
  - 支持数学常量：`pi`, `e`
  - 支持高级函数：`sqrt`, `sin`, `cos`, `tan`, `log`, `exp`等
  - 内置安全性检查，防止恶意代码执行

### 扩展内置工具

你可以通过取消注释 `builtin_tools.py` 中的代码来启用更多工具：

```python
# 时间工具
# get_current_time(): 获取当前时间
# get_current_date(): 获取当前日期

# 文本分析工具  
# analyze_text(text: str): 文本统计分析

# 搜索工具
# search_web(query: SearchQuery): 模拟网络搜索

# 数据转换工具
# convert_data_format(data, from_format, to_format): 数据格式转换

# 帮助工具
# get_tool_help(tool_name): 获取工具帮助信息
```

## 调试和监控

### 获取系统状态

```python
from app.tools.registry import get_tools_summary
from app.tools.startup import get_startup_info

# 获取工具注册摘要
summary = get_tools_summary()
print(f"已注册工具数量: {summary['registered_tools_count']}")
print(f"可用工具: {summary['registered_tools']}")

# 获取启动信息
startup_info = get_startup_info()
print(f"启动状态: {startup_info}")
```

### 查看待注册工具

```python
from app.tools.decorators import get_pending_tools, get_instance_tools

# 查看待注册的工具
pending = get_pending_tools()
print(f"待注册工具: {[t['name'] for t in pending]}")

# 查看实例工具
instance_tools = get_instance_tools()
print(f"实例工具数量: {len(instance_tools)}")
```

### 日志配置

工具系统使用标准Python logging，可以通过配置日志级别来控制输出：

```python
import logging

# 设置工具系统日志级别
logging.getLogger('app.tools').setLevel(logging.DEBUG)
```

## 最佳实践

### 1. 函数文档和类型注解

```python
@tool(description="完整示例工具")
def example_tool(
    text: str,
    count: int = 1,
    options: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    完整的工具函数示例
    
    Args:
        text: 输入文本，必需参数
        count: 重复次数，默认为1
        options: 可选的选项列表
        
    Returns:
        包含处理结果的字典
        
    Raises:
        ValueError: 当count小于1时抛出
    """
    if count < 1:
        raise ValueError("count必须大于0")
        
    result = {
        "processed_text": text * count,
        "count": count,
        "options": options or []
    }
    
    return result
```

### 2. 错误处理

```python
@tool(description="带错误处理的工具")
def robust_tool(data: str) -> str:
    """具有完整错误处理的工具"""
    try:
        # 输入验证
        if not data or not isinstance(data, str):
            return "错误: 输入数据无效"
            
        # 业务逻辑
        result = process_data(data)
        return f"处理成功: {result}"
        
    except Exception as e:
        # 记录错误并返回用户友好的消息
        import logging
        logging.getLogger(__name__).error(f"工具执行失败: {e}")
        return f"处理失败: {str(e)}"
```

### 3. 异步工具

```python
@tool(description="异步工具示例")
async def async_tool(url: str) -> str:
    """异步HTTP请求工具"""
    import aiohttp
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as response:
                return await response.text()
    except Exception as e:
        return f"请求失败: {str(e)}"
```

### 4. 使用Pydantic进行复杂验证

```python
from pydantic import BaseModel, Field, validator

class ProcessingConfig(BaseModel):
    input_text: str = Field(..., min_length=1, description="输入文本")
    max_length: int = Field(100, ge=1, le=1000, description="最大长度")
    language: str = Field("zh", regex=r"^(zh|en)$", description="语言代码")
    
    @validator('input_text')
    def validate_text(cls, v):
        if not v.strip():
            raise ValueError('输入文本不能为空')
        return v.strip()

@tool(description="使用Pydantic验证的工具")
def validated_tool(config: ProcessingConfig) -> dict:
    """使用Pydantic模型进行参数验证的工具"""
    return {
        "processed": config.input_text[:config.max_length],
        "language": config.language,
        "truncated": len(config.input_text) > config.max_length
    }
```

## 故障排除

### 常见问题

1. **工具未注册**
   ```python
   # 检查工具是否在待注册列表中
   from app.tools.decorators import get_pending_tools
   pending = get_pending_tools()
   print([t['name'] for t in pending])
   ```

2. **工具管理器未初始化**
   ```python
   # 确保在使用前初始化
   from app.tools import init_tool_manager
   init_tool_manager()
   ```

3. **类方法工具未注册**
   ```python
   # 确保继承ToolProvider并调用super().__init__()
   class MyService(ToolProvider):
       def __init__(self):
           super().__init__()  # 必需！
   ```

4. **Schema生成失败**
   ```python
   # 检查函数签名和文档字符串
   @tool(description="测试")
   def test_function(param: str) -> str:  # 确保有类型注解
       """必须有文档字符串"""
       return param
   ```

### 调试技巧

```python
# 启用详细日志
import logging
logging.basicConfig(level=logging.DEBUG)

# 检查工具状态
from app.tools import get_tool_manager
manager = get_tool_manager()
print(f"已注册工具: {manager.list_tools()}")

# 检查特定工具信息
info = manager.get_tool_info("tool_name")
if info:
    print(f"Schema: {info['schema']}")
else:
    print("工具不存在")
```

## 版本信息

当前版本: v1.0.0

### 更新日志

- v1.0.0: 初始版本，支持装饰器注册、类方法、异步函数等核心功能
