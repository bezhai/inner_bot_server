"""
内置工具集合

提供常用的AI工具，使用装饰器方式定义
"""

import asyncio
import math
import re
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field

from .decorators import tool


# ===== 时间相关工具 =====

# @tool(description="获取当前日期和时间")
# def get_current_time() -> str:
#     """
#     获取当前的日期和时间

#     Returns:
#         格式化的当前时间字符串
#     """
#     return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


# @tool(description="获取当前日期")
# def get_current_date() -> str:
#     """
#     获取当前日期

#     Returns:
#         格式化的当前日期字符串
#     """
#     return datetime.now().strftime("%Y-%m-%d")


# ===== 数学计算工具 =====


@tool(description="执行数学表达式计算")
def calculate(expression: str) -> str:
    """
    计算数学表达式

    Args:
        expression: 要计算的数学表达式，支持基本运算符和函数

    Returns:
        计算结果字符串
    """
    try:
        # 创建安全的计算环境
        allowed_names = {
            # 基本数学函数
            "abs": abs,
            "round": round,
            "min": min,
            "max": max,
            "sum": sum,
            "pow": pow,
            # 数学常量
            "pi": math.pi,
            "e": math.e,
            # 数学函数
            "sqrt": math.sqrt,
            "sin": math.sin,
            "cos": math.cos,
            "tan": math.tan,
            "log": math.log,
            "log10": math.log10,
            "exp": math.exp,
            "floor": math.floor,
            "ceil": math.ceil,
            "asin": math.asin,
            "acos": math.acos,
            "atan": math.atan,
            "sinh": math.sinh,
            "cosh": math.cosh,
            "tanh": math.tanh,
            "degrees": math.degrees,
            "radians": math.radians,
        }

        # 验证表达式安全性
        if re.search(r"[a-zA-Z_][a-zA-Z0-9_]*\s*\(.*\)", expression):
            # 检查是否只包含允许的函数
            function_names = re.findall(r"([a-zA-Z_][a-zA-Z0-9_]*)\s*\(", expression)
            for func_name in function_names:
                if func_name not in allowed_names:
                    return f"错误：不允许使用函数 '{func_name}'"

        # 只允许安全的操作
        result = eval(expression, {"__builtins__": {}}, allowed_names)
        return str(result)

    except ZeroDivisionError:
        return "错误：除零错误"
    except ValueError as e:
        return f"错误：数值错误 - {str(e)}"
    except Exception as e:
        return f"错误：无法计算表达式 '{expression}' - {str(e)}"


# ===== 文本处理工具 =====

# @tool(description="计算文本长度和统计信息")
# def analyze_text(text: str) -> dict:
#     """
#     分析文本的基本统计信息

#     Args:
#         text: 要分析的文本

#     Returns:
#         包含文本统计信息的字典
#     """
#     try:
#         # 基本统计
#         char_count = len(text)
#         char_count_no_spaces = len(text.replace(' ', ''))
#         word_count = len(text.split())
#         line_count = len(text.splitlines())

#         # 段落统计
#         paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]
#         paragraph_count = len(paragraphs)

#         return {
#             "字符数": char_count,
#             "字符数(不含空格)": char_count_no_spaces,
#             "单词数": word_count,
#             "行数": line_count,
#             "段落数": paragraph_count,
#             "平均每行字符数": round(char_count / line_count, 2) if line_count > 0 else 0,
#             "平均每段字符数": round(char_count / paragraph_count, 2) if paragraph_count > 0 else 0
#         }

#     except Exception as e:
#         return {"错误": f"文本分析失败: {str(e)}"}


# ===== 搜索和查询工具 =====

# class SearchQuery(BaseModel):
#     """搜索查询参数模型"""
#     query: str = Field(description="搜索关键词")
#     language: str = Field(default="zh", description="搜索语言，默认中文")
#     max_results: int = Field(default=5, description="最大结果数量")


# @tool(description="模拟网络搜索功能")
# async def search_web(query: SearchQuery) -> str:
#     """
#     模拟网络搜索（示例实现）

#     Args:
#         query: 搜索查询参数

#     Returns:
#         搜索结果字符串
#     """
#     # 模拟网络延迟
#     await asyncio.sleep(0.1)

#     # 模拟搜索结果
#     results = [
#         f"搜索结果 1: 关于 '{query.query}' 的详细信息",
#         f"搜索结果 2: '{query.query}' 的最新发展",
#         f"搜索结果 3: '{query.query}' 相关讨论",
#         f"搜索结果 4: '{query.query}' 技术指南",
#         f"搜索结果 5: '{query.query}' 案例分析"
#     ]

#     # 根据max_results限制结果数量
#     limited_results = results[:query.max_results]

#     return "\n".join([
#         f"搜索关键词: {query.query}",
#         f"语言: {query.language}",
#         f"结果数量: {len(limited_results)}",
#         "=" * 30,
#         *limited_results
#     ])


# ===== 数据转换工具 =====

# @tool(description="转换数据格式")
# def convert_data_format(data: str, from_format: str, to_format: str) -> str:
#     """
#     转换数据格式

#     Args:
#         data: 要转换的数据
#         from_format: 源格式 (json, csv, text)
#         to_format: 目标格式 (json, csv, text)

#     Returns:
#         转换后的数据
#     """
#     try:
#         import json

#         if from_format.lower() == "json":
#             # 从JSON解析
#             parsed_data = json.loads(data)

#             if to_format.lower() == "text":
#                 return str(parsed_data)
#             elif to_format.lower() == "csv":
#                 if isinstance(parsed_data, list) and parsed_data:
#                     if isinstance(parsed_data[0], dict):
#                         # 转换为CSV格式
#                         headers = list(parsed_data[0].keys())
#                         csv_lines = [",".join(headers)]
#                         for item in parsed_data:
#                             csv_lines.append(",".join(str(item.get(h, "")) for h in headers))
#                         return "\n".join(csv_lines)
#                 return str(parsed_data)
#             else:
#                 return json.dumps(parsed_data, ensure_ascii=False, indent=2)

#         elif from_format.lower() == "csv":
#             lines = data.strip().split('\n')
#             if len(lines) < 2:
#                 return "错误：CSV数据格式不正确"

#             headers = lines[0].split(',')
#             rows = []
#             for line in lines[1:]:
#                 values = line.split(',')
#                 row = {headers[i]: values[i] if i < len(values) else "" for i in range(len(headers))}
#                 rows.append(row)

#             if to_format.lower() == "json":
#                 return json.dumps(rows, ensure_ascii=False, indent=2)
#             elif to_format.lower() == "text":
#                 return str(rows)
#             else:
#                 return data  # 保持原格式

#         else:
#             return f"不支持的格式转换: {from_format} -> {to_format}"

#     except Exception as e:
#         return f"格式转换失败: {str(e)}"


# ===== 帮助工具 =====

# @tool(description="获取工具使用帮助")
# def get_tool_help(tool_name: Optional[str] = None) -> str:
#     """
#     获取工具使用帮助信息

#     Args:
#         tool_name: 特定工具名称，如果为空则显示所有工具概览

#     Returns:
#         帮助信息字符串
#     """
#     help_info = {
#         "get_current_time": "获取当前日期和时间，无需参数",
#         "get_current_date": "获取当前日期，无需参数",
#         "calculate": "计算数学表达式，参数：expression (要计算的表达式)",
#         "analyze_text": "分析文本统计信息，参数：text (要分析的文本)",
#         "search_web": "网络搜索，参数：query, language, max_results",
#         "convert_data_format": "数据格式转换，参数：data, from_format, to_format",
#         "get_tool_help": "获取工具帮助，参数：tool_name (可选)"
#     }

#     if tool_name:
#         if tool_name in help_info:
#             return f"工具 '{tool_name}' 使用说明：\n{help_info[tool_name]}"
#         else:
#             return f"未找到工具 '{tool_name}'，可用工具：{', '.join(help_info.keys())}"
#     else:
#         lines = ["可用工具列表："]
#         for name, desc in help_info.items():
#             lines.append(f"- {name}: {desc}")
#         return "\n".join(lines)
