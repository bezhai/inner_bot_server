"""
LangGraph 聊天节点实现
"""

import logging
import asyncio
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.services.chat.context import MessageContext
from app.services.chat.prompt import PromptGeneratorParam, PromptService
from app.services.meta_info import AsyncRedisClient
from app.types.chat import ChatStreamChunk, ToolCallFeedbackResponse
from app.tools import get_tool_manager
from langgraph.config import get_stream_writer
from .state import ChatGraphState, update_state_with_chunk
from .models import LangGraphModelService
from .streaming import RealTimeStreamingManager

logger = logging.getLogger(__name__)


async def initialize_node(state: ChatGraphState) -> ChatGraphState:
    """
    初始化节点 - 设置Redis锁、初始化消息上下文、准备提示词参数
    
    Args:
        state: 图状态
        
    Returns:
        更新后的图状态
    """
    message_id = state["message_id"]
    
    # 1. 获取Redis锁
    redis_client = AsyncRedisClient.get_instance()
    lock_key = f"msg_lock:{message_id}"
    
    try:
        # 加锁，过期时间60秒
        await redis_client.set(lock_key, "1", nx=True, ex=60)
        logger.info(f"消息锁定成功: {message_id}")
    except Exception as e:
        logger.warning(f"消息加锁失败: {message_id}, 错误: {str(e)}")
    
    # 2. 初始化消息上下文
    try:
        context = MessageContext(message_id, PromptService.get_prompt)
        await context.init_context_messages()
        state["context"] = context
        logger.info(f"消息上下文初始化成功: {message_id}")
    except Exception as e:
        logger.error(f"消息上下文初始化失败: {message_id}, 错误: {str(e)}")
        state["error_message"] = f"上下文初始化失败: {str(e)}"
        return state
    
    # 3. 设置提示词参数
    current_time = datetime.now()
    state["prompt_params"] = {
        "currDate": current_time.strftime("%Y-%m-%d"),
        "currTime": current_time.strftime("%H:%M:%S"),
    }
    
    # 4. 更新时间
    state["last_yield_time"] = asyncio.get_event_loop().time()
    
    logger.info(f"初始化节点完成: {message_id}")
    return state


async def prompt_generation_node(state: ChatGraphState) -> ChatGraphState:
    """
    提示词生成节点 - 动态生成系统提示词，注入时间、上下文等参数
    
    Args:
        state: 图状态
        
    Returns:
        更新后的图状态
    """
    message_id = state["message_id"]
    
    try:
        # 1. 获取提示词参数
        prompt_params = PromptGeneratorParam(**state["prompt_params"])
        
        # 2. 生成提示词
        generated_prompt = PromptService.get_prompt(prompt_params)
        state["generated_prompt"] = generated_prompt
        
        logger.info(f"提示词生成完成: {message_id}")
        return state
        
    except Exception as e:
        logger.error(f"提示词生成失败: {message_id}, 错误: {str(e)}")
        state["error_message"] = f"提示词生成失败: {str(e)}"
        return state


async def model_call_node(state: ChatGraphState) -> ChatGraphState:
    """
    模型调用节点 - 调用OpenAI API，处理流式响应，检测工具调用
    
    Args:
        state: 图状态
        
    Returns:
        更新后的图状态
    """
    message_id = state["message_id"]

    try:
        # 获取流式写入器
        writer = get_stream_writer()

        # 1. 准备模型服务
        model_service = LangGraphModelService()

        # 2. 获取模型配置
        model_config = state["model_config"]
        model_id = model_config.get("model_id", "gpt-4o-mini")
        temperature = model_config.get("temperature", 0.7)
        enable_tools = model_config.get("enable_tools", True)

        # 3. 获取上下文
        context = state["context"]
        if not context:
            raise ValueError("消息上下文未初始化")

        # 4. 准备工具配置
        tools = None
        if enable_tools:
            try:
                tool_manager = get_tool_manager()
                tools = tool_manager.get_tools_schema()
            except RuntimeError:
                logger.warning("工具系统未初始化，禁用工具")
                enable_tools = False

        # 5. 构建消息列表
        prompt_param = PromptGeneratorParam(**state["prompt_params"])
        messages = context.build(prompt_param)

        # 6. 获取流式配置
        streaming_config = state["streaming_config"]
        yield_interval = streaming_config.get("yield_interval", 0.5)

        # 7. 初始化流式管理器
        streaming_manager = RealTimeStreamingManager(yield_interval)

        # 8. 调用模型流式处理
        pending_tool_calls = []

        async for chunk in model_service.stream_chat_completion(
            model_id=model_id,
            messages=messages,
            temperature=temperature,
            tools=tools,
            max_tool_iterations=10,
        ):
            # 处理内容 - 实时输出
            if chunk.delta and chunk.delta.content:
                content = chunk.delta.content

                # 创建流式块
                stream_chunk = ChatStreamChunk(content=content)

                # 通过writer实时输出
                if streaming_manager.should_yield():
                    accumulated_chunk = streaming_manager.yield_chunk(stream_chunk)
                    writer(accumulated_chunk)
                else:
                    # 即使不输出也要累积内容
                    streaming_manager.accumulate_chunk(stream_chunk)

                # 更新状态
                state = update_state_with_chunk(state, stream_chunk)

            # 处理工具调用
            if chunk.delta and chunk.delta.tool_calls:
                for tool_call in chunk.delta.tool_calls:
                    # 累积工具调用信息
                    if tool_call.index >= len(pending_tool_calls):
                        pending_tool_calls.extend([{
                            "id": "",
                            "type": "function",
                            "function": {"name": "", "arguments": ""}
                        }] * (tool_call.index - len(pending_tool_calls) + 1))

                    tc = pending_tool_calls[tool_call.index]
                    if tool_call.id:
                        tc["id"] += tool_call.id
                    if tool_call.function and tool_call.function.name:
                        tc["function"]["name"] += tool_call.function.name
                    if tool_call.function and tool_call.function.arguments:
                        tc["function"]["arguments"] += tool_call.function.arguments

            # 处理完成原因
            if chunk.finish_reason:
                state["finish_reason"] = chunk.finish_reason
                logger.info(f"模型调用完成: {message_id}, finish_reason: {chunk.finish_reason}")
                break

        # 9. 最终输出（如果有剩余内容）
        if streaming_manager.accumulated_content:
            final_chunk = streaming_manager.get_final_chunk()
            writer(final_chunk)

        # 10. 保存工具调用信息
        if pending_tool_calls:
            # 过滤完整的工具调用
            complete_tool_calls = []
            for tc in pending_tool_calls:
                if tc["id"] and tc["function"]["name"]:
                    complete_tool_calls.append(tc)

            if complete_tool_calls:
                state["pending_tool_calls"] = complete_tool_calls
                logger.info(f"检测到工具调用: {len(complete_tool_calls)} 个")

        logger.info(f"模型调用节点完成: {message_id}")
        return state

    except Exception as e:
        logger.error(f"模型调用失败: {message_id}, 错误: {str(e)}")
        state["error_message"] = f"模型调用失败: {str(e)}"
        return state


async def tool_execution_node(state: ChatGraphState) -> ChatGraphState:
    """
    工具执行节点 - 执行工具调用，处理工具结果，更新上下文
    
    Args:
        state: 图状态
        
    Returns:
        更新后的图状态
    """
    message_id = state["message_id"]

    # 1. 检查是否有待处理工具调用
    if not state["pending_tool_calls"]:
        logger.info(f"无待处理工具调用: {message_id}")
        return state

    try:
        # 获取流式写入器
        writer = get_stream_writer()

        # 2. 获取工具管理器
        tool_manager = get_tool_manager()
        tool_results = []

        # 3. 遍历执行工具调用
        for tool_call in state["pending_tool_calls"]:
            tool_name = tool_call["function"]["name"]
            tool_args = tool_call["function"]["arguments"]

            # 输出工具调用开始信息
            start_feedback = ToolCallFeedbackResponse(
                name=tool_name, nick_name=f"执行工具: {tool_name}"
            )
            start_chunk = ChatStreamChunk(tool_call_feedback=start_feedback)
            writer(start_chunk)

            try:
                # 解析工具参数
                import json
                if isinstance(tool_args, str):
                    tool_args = json.loads(tool_args)

                # 执行工具
                logger.info(f"执行工具: {tool_name}, 参数: {tool_args}")
                result = await tool_manager.execute_tool(tool_name, tool_args)

                # 输出工具执行完成信息
                success_feedback = ToolCallFeedbackResponse(
                    name=tool_name, nick_name=f"工具执行完成: {tool_name}"
                )
                success_chunk = ChatStreamChunk(tool_call_feedback=success_feedback)
                writer(success_chunk)

                # 创建工具结果
                tool_result = {
                    "tool_call_id": tool_call["id"],
                    "role": "tool",
                    "name": tool_name,
                    "content": json.dumps(result) if not isinstance(result, str) else result,
                }
                tool_results.append(tool_result)

                # 创建工具调用反馈（用于状态更新）
                tool_feedback = ToolCallFeedbackResponse(
                    name=tool_name,
                    nick_name=tool_name
                )

                # 创建反馈块
                feedback_chunk = ChatStreamChunk(
                    tool_call_feedback=tool_feedback
                )
                state = update_state_with_chunk(state, feedback_chunk)

                logger.info(f"工具执行成功: {tool_name}")

            except Exception as e:
                logger.error(f"工具执行失败: {tool_name}, 错误: {str(e)}")

                # 工具执行失败
                error_feedback = ToolCallFeedbackResponse(
                    name=tool_name, nick_name=f"工具执行失败: {tool_name}"
                )
                error_chunk = ChatStreamChunk(tool_call_feedback=error_feedback)
                writer(error_chunk)

                # 添加错误结果
                tool_result = {
                    "tool_call_id": tool_call["id"],
                    "role": "tool",
                    "name": tool_name,
                    "content": f"Error: {str(e)}",
                }
                tool_results.append(tool_result)

        # 4. 更新上下文和状态
        context = state["context"]
        if context:
            # 添加助手消息
            context.append_message({
                "role": "assistant",
                "content": state["accumulated_content"] or None,
                "tool_calls": state["pending_tool_calls"],
            })

            # 添加工具结果
            for result in tool_results:
                context.append_message(result)

        # 5. 保存工具结果并清理待处理调用
        state["tool_results"] = tool_results
        state["pending_tool_calls"] = []

        logger.info(f"工具执行节点完成: {message_id}, 执行了 {len(tool_results)} 个工具")
        return state

    except Exception as e:
        logger.error(f"工具执行节点失败: {message_id}, 错误: {str(e)}")
        state["error_message"] = f"工具执行失败: {str(e)}"
        return state


async def output_processing_node(state: ChatGraphState) -> ChatGraphState:
    """
    输出处理节点 - 处理特殊finish_reason，格式化输出
    
    Args:
        state: 图状态
        
    Returns:
        更新后的图状态
    """
    message_id = state["message_id"]
    
    try:
        # 1. 处理特殊finish_reason
        finish_reason = state.get("finish_reason")
        
        if finish_reason == "content_filter":
            # 内容过滤特殊处理
            special_chunk = ChatStreamChunk(
                content="赤尾有点不想讨论这个话题呢~"
            )
            state = update_state_with_chunk(state, special_chunk)
            logger.info(f"处理content_filter: {message_id}")
            
        elif finish_reason == "length":
            # 长度截断特殊处理
            special_chunk = ChatStreamChunk(
                content="(后续内容被截断)"
            )
            state = update_state_with_chunk(state, special_chunk)
            logger.info(f"处理length截断: {message_id}")
        
        # 2. 其他输出处理逻辑可以在这里添加
        
        logger.info(f"输出处理节点完成: {message_id}")
        return state
        
    except Exception as e:
        logger.error(f"输出处理失败: {message_id}, 错误: {str(e)}")
        state["error_message"] = f"输出处理失败: {str(e)}"
        return state


async def cleanup_node(state: ChatGraphState) -> ChatGraphState:
    """
    清理节点 - 释放Redis锁，清理资源
    
    Args:
        state: 图状态
        
    Returns:
        更新后的图状态
    """
    message_id = state["message_id"]
    
    # 1. 释放Redis锁
    redis_client = AsyncRedisClient.get_instance()
    lock_key = f"msg_lock:{message_id}"
    
    try:
        await redis_client.delete(lock_key)
        logger.info(f"消息解锁成功: {message_id}")
    except Exception as e:
        logger.warning(f"消息解锁失败: {message_id}, 错误: {str(e)}")
    
    # 2. 其他清理逻辑可以在这里添加
    
    logger.info(f"清理节点完成: {message_id}")
    return state


# 条件判断函数
def should_continue_with_tools(state: ChatGraphState) -> str:
    """
    判断是否继续工具调用
    
    Args:
        state: 图状态
        
    Returns:
        下一个节点名称
    """
    pending_tool_calls = state.get("pending_tool_calls", [])
    finish_reason = state.get("finish_reason")
    
    if pending_tool_calls and finish_reason == "tool_calls":
        return "tool_execution"
    return "output_processing"


def should_continue_after_tools(state: ChatGraphState) -> str:
    """
    工具执行后判断是否继续
    
    Args:
        state: 图状态
        
    Returns:
        下一个节点名称
    """
    tool_results = state.get("tool_results", [])
    
    if tool_results:
        # 有工具结果，继续模型调用
        return "model_call"
    return "output_processing"
