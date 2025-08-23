"""
Agent 节点
将 Agent 封装成节点，支持简单的编排功能
"""

import asyncio
import logging
from collections.abc import AsyncGenerator
from typing import Any, Dict, List, Optional, Callable

from pydantic import BaseModel

from .agent import BaseAgent
from app.types.chat import ChatStreamChunk

logger = logging.getLogger(__name__)


class NodeConfig(BaseModel):
    """节点配置"""
    node_id: str
    name: str
    description: str = ""
    input_schema: Dict[str, Any] = {}
    output_schema: Dict[str, Any] = {}
    metadata: Dict[str, Any] = {}


class NodeInput(BaseModel):
    """节点输入"""
    message: str
    context: Dict[str, Any] = {}
    previous_results: Dict[str, Any] = {}


class NodeOutput(BaseModel):
    """节点输出"""
    content: str = ""
    context: Dict[str, Any] = {}
    metadata: Dict[str, Any] = {}
    success: bool = True
    error: Optional[str] = None


class AgentNode:
    """Agent 节点"""
    
    def __init__(
        self,
        config: NodeConfig,
        agent: BaseAgent,
        input_transformer: Optional[Callable[[NodeInput], str]] = None,
        output_transformer: Optional[Callable[[str, Dict[str, Any]], NodeOutput]] = None,
    ):
        self.config = config
        self.agent = agent
        self.input_transformer = input_transformer or self._default_input_transformer
        self.output_transformer = output_transformer or self._default_output_transformer
        
    def _default_input_transformer(self, node_input: NodeInput) -> str:
        """默认输入转换器"""
        return node_input.message
    
    def _default_output_transformer(self, content: str, context: Dict[str, Any]) -> NodeOutput:
        """默认输出转换器"""
        return NodeOutput(
            content=content,
            context=context,
            success=True
        )
    
    async def execute_stream(
        self,
        node_input: NodeInput
    ) -> AsyncGenerator[ChatStreamChunk, None]:
        """流式执行节点"""
        try:
            # 转换输入
            agent_input = self.input_transformer(node_input)
            
            # 准备上下文
            agent_context = {
                **node_input.context,
                "node_id": self.config.node_id,
                "previous_results": node_input.previous_results
            }
            
            # 执行 Agent
            accumulated_content = ""
            
            async for chunk in self.agent.process_stream(agent_input, agent_context):
                if chunk.content:
                    accumulated_content += chunk.content
                yield chunk
            
            # 转换输出（这里不直接返回，因为是流式的）
            # 输出转换会在编排器中处理
            
        except Exception as e:
            logger.error(f"Node {self.config.node_id} execution error: {e}")
            yield ChatStreamChunk(content=f"节点执行错误: {str(e)}")
    
    async def execute(self, node_input: NodeInput) -> NodeOutput:
        """非流式执行节点"""
        try:
            # 转换输入
            agent_input = self.input_transformer(node_input)
            
            # 准备上下文
            agent_context = {
                **node_input.context,
                "node_id": self.config.node_id,
                "previous_results": node_input.previous_results
            }
            
            # 执行 Agent 并收集结果
            accumulated_content = ""
            
            async for chunk in self.agent.process_stream(agent_input, agent_context):
                if chunk.content:
                    accumulated_content += chunk.content
            
            # 转换输出
            return self.output_transformer(accumulated_content, agent_context)
            
        except Exception as e:
            logger.error(f"Node {self.config.node_id} execution error: {e}")
            return NodeOutput(
                content=f"节点执行错误: {str(e)}",
                success=False,
                error=str(e)
            )


class ConditionalNode:
    """条件节点 - 根据条件选择执行路径"""
    
    def __init__(
        self,
        config: NodeConfig,
        condition_func: Callable[[NodeInput], bool],
        true_node: AgentNode,
        false_node: Optional[AgentNode] = None,
    ):
        self.config = config
        self.condition_func = condition_func
        self.true_node = true_node
        self.false_node = false_node
    
    async def execute_stream(
        self,
        node_input: NodeInput
    ) -> AsyncGenerator[ChatStreamChunk, None]:
        """流式执行条件节点"""
        try:
            # 评估条件
            condition_result = self.condition_func(node_input)
            
            # 选择执行的节点
            selected_node = self.true_node if condition_result else self.false_node
            
            if selected_node is None:
                yield ChatStreamChunk(content="条件不满足，跳过执行")
                return
            
            # 执行选中的节点
            async for chunk in selected_node.execute_stream(node_input):
                yield chunk
                
        except Exception as e:
            logger.error(f"Conditional node {self.config.node_id} error: {e}")
            yield ChatStreamChunk(content=f"条件节点执行错误: {str(e)}")
    
    async def execute(self, node_input: NodeInput) -> NodeOutput:
        """非流式执行条件节点"""
        try:
            # 评估条件
            condition_result = self.condition_func(node_input)
            
            # 选择执行的节点
            selected_node = self.true_node if condition_result else self.false_node
            
            if selected_node is None:
                return NodeOutput(
                    content="条件不满足，跳过执行",
                    success=True
                )
            
            # 执行选中的节点
            return await selected_node.execute(node_input)
            
        except Exception as e:
            logger.error(f"Conditional node {self.config.node_id} error: {e}")
            return NodeOutput(
                content=f"条件节点执行错误: {str(e)}",
                success=False,
                error=str(e)
            )


class ParallelNode:
    """并行节点 - 并行执行多个节点"""
    
    def __init__(
        self,
        config: NodeConfig,
        nodes: List[AgentNode],
        merge_func: Optional[Callable[[List[NodeOutput]], NodeOutput]] = None,
    ):
        self.config = config
        self.nodes = nodes
        self.merge_func = merge_func or self._default_merge_func
    
    def _default_merge_func(self, outputs: List[NodeOutput]) -> NodeOutput:
        """默认合并函数"""
        contents = []
        contexts = {}
        success = True
        errors = []
        
        for output in outputs:
            if output.content:
                contents.append(output.content)
            contexts.update(output.context)
            success = success and output.success
            if output.error:
                errors.append(output.error)
        
        return NodeOutput(
            content="\n\n".join(contents),
            context=contexts,
            success=success,
            error="; ".join(errors) if errors else None
        )
    
    async def execute_stream(
        self,
        node_input: NodeInput
    ) -> AsyncGenerator[ChatStreamChunk, None]:
        """流式执行并行节点"""
        # 注意：流式并行执行比较复杂，这里简化为顺序执行
        # 真正的并行流式需要更复杂的流合并逻辑
        
        for i, node in enumerate(self.nodes):
            if i > 0:
                yield ChatStreamChunk(content=f"\n\n--- 节点 {i+1} ---\n")
            
            async for chunk in node.execute_stream(node_input):
                yield chunk
    
    async def execute(self, node_input: NodeInput) -> NodeOutput:
        """非流式执行并行节点"""
        try:
            # 并行执行所有节点
            tasks = [node.execute(node_input) for node in self.nodes]
            outputs = await asyncio.gather(*tasks, return_exceptions=True)
            
            # 处理异常
            processed_outputs = []
            for i, output in enumerate(outputs):
                if isinstance(output, Exception):
                    processed_outputs.append(NodeOutput(
                        content=f"节点 {i} 执行失败: {str(output)}",
                        success=False,
                        error=str(output)
                    ))
                else:
                    processed_outputs.append(output)
            
            # 合并结果
            return self.merge_func(processed_outputs)
            
        except Exception as e:
            logger.error(f"Parallel node {self.config.node_id} error: {e}")
            return NodeOutput(
                content=f"并行节点执行错误: {str(e)}",
                success=False,
                error=str(e)
            )


# 节点类型联合
NodeType = AgentNode | ConditionalNode | ParallelNode