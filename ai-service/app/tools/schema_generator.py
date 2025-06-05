"""
工具Schema自动生成器

从函数签名、类型注解和文档字符串自动生成OpenAI工具调用的schema
"""

import inspect
import json
from typing import (
    Any, Dict, List, Optional, Union, get_type_hints, 
    get_origin, get_args, Callable
)
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)

def _python_type_to_json_schema(py_type: Any) -> Dict[str, Any]:
    """将Python类型转换为JSON Schema类型"""
    
    # 处理联合类型 (Union)
    origin = get_origin(py_type)
    if origin is Union:
        args = get_args(py_type)
        # 处理Optional类型 (Union[T, None])
        if len(args) == 2 and type(None) in args:
            non_none_type = args[0] if args[1] is type(None) else args[1]
            return _python_type_to_json_schema(non_none_type)
        # 其他Union类型暂不支持
        return {"type": "string"}
    
    # 处理List类型
    if origin is list or py_type is list:
        if hasattr(py_type, '__args__') and py_type.__args__:
            item_type = _python_type_to_json_schema(py_type.__args__[0])
            return {"type": "array", "items": item_type}
        return {"type": "array"}
    
    # 处理Dict类型
    if origin is dict or py_type is dict:
        return {"type": "object"}
    
    # 基础类型映射
    type_mapping = {
        str: {"type": "string"},
        int: {"type": "integer"},
        float: {"type": "number"},
        bool: {"type": "boolean"},
        list: {"type": "array"},
        dict: {"type": "object"},
    }
    
    return type_mapping.get(py_type, {"type": "string"})


def _extract_docstring_info(func: Callable) -> Dict[str, Any]:
    """从文档字符串中提取函数和参数描述"""
    docstring = inspect.getdoc(func)
    if not docstring:
        return {"description": "", "param_descriptions": {}}
    
    lines = docstring.strip().split('\n')
    description_lines = []
    param_descriptions = {}
    
    in_args_section = False
    current_param = None
    
    for line in lines:
        line = line.strip()
        
        # 检测Args:部分开始
        if line.lower().startswith('args:'):
            in_args_section = True
            continue
        
        # 检测其他部分开始(Returns:, Raises:等)
        if line.lower().startswith(('returns:', 'return:', 'raises:', 'raise:', 'yields:', 'yield:')):
            in_args_section = False
            continue
        
        if in_args_section:
            # 参数定义行 (param_name: description)
            if ':' in line and not line.startswith(' '):
                parts = line.split(':', 1)
                if len(parts) == 2:
                    current_param = parts[0].strip()
                    param_descriptions[current_param] = parts[1].strip()
            # 参数描述续行
            elif current_param and line.startswith(' '):
                param_descriptions[current_param] += ' ' + line.strip()
        else:
            # 函数主描述
            if line:
                description_lines.append(line)
    
    return {
        "description": ' '.join(description_lines),
        "param_descriptions": param_descriptions
    }


def generate_tool_schema(
    func: Callable,
    name: Optional[str] = None,
    description: Optional[str] = None
) -> Dict[str, Any]:
    """
    为函数生成OpenAI工具调用schema
    
    Args:
        func: 要生成schema的函数
        name: 工具名称，默认使用函数名
        description: 工具描述，默认从docstring提取
        
    Returns:
        OpenAI工具调用格式的schema
    """
    
    # 获取函数信息
    func_name = name or func.__name__
    signature = inspect.signature(func)
    type_hints = get_type_hints(func)
    docstring_info = _extract_docstring_info(func)
    
    # 使用提供的描述或从docstring提取
    func_description = description or docstring_info["description"] or f"调用{func_name}函数"
    
    # 构建参数schema
    properties = {}
    required = []
    
    for param_name, param in signature.parameters.items():
        # 跳过self和cls参数
        if param_name in ('self', 'cls'):
            continue
            
        # 获取参数类型
        param_type = type_hints.get(param_name, str)
        
        # 处理Pydantic模型
        if inspect.isclass(param_type) and issubclass(param_type, BaseModel):
            # 直接使用Pydantic的schema生成
            pydantic_schema = param_type.model_json_schema()
            properties.update(pydantic_schema.get("properties", {}))
            required.extend(pydantic_schema.get("required", []))
            continue
        
        # 生成参数schema
        param_schema = _python_type_to_json_schema(param_type)
        
        # 添加参数描述
        param_desc = docstring_info["param_descriptions"].get(param_name)
        if param_desc:
            param_schema["description"] = param_desc
        
        properties[param_name] = param_schema
        
        # 判断是否为必需参数
        if param.default is param.empty:
            required.append(param_name)
    
    # 构建完整的schema
    schema = {
        "type": "function",
        "function": {
            "name": func_name,
            "description": func_description,
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": required
            }
        }
    }
    
    logger.debug(f"为函数 {func_name} 生成schema: {json.dumps(schema, indent=2, ensure_ascii=False)}")
    
    return schema


def validate_tool_function(func: Callable) -> bool:
    """
    验证函数是否适合作为工具
    
    Args:
        func: 要验证的函数
        
    Returns:
        是否有效
    """
    try:
        # 检查是否可调用
        if not callable(func):
            logger.warning(f"{func} 不是可调用对象")
            return False
        
        # 检查签名是否有效
        signature = inspect.signature(func)
        
        # 生成schema测试
        generate_tool_schema(func)
        
        return True
        
    except Exception as e:
        logger.error(f"验证工具函数 {func} 失败: {e}")
        return False 