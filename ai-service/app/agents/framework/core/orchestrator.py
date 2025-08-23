"""
节点编排器
管理和编排多个 Agent 节点的执行
"""

import asyncio
import logging
from collections.abc import AsyncGenerator
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel

from .node import NodeType, NodeInput, NodeOutput, AgentNode
from app.types.chat import ChatStreamChunk

logger = logging.getLogger(__name__)


class Edge(BaseModel):
    """边 - 连接两个节点"""
    from_node: str
    to_node: str
    condition: Optional[str] = None  # 可选的条件表达式
    weight: float = 1.0
    metadata: Dict[str, Any] = {}


class WorkflowConfig(BaseModel):
    """工作流配置"""
    name: str
    description: str = ""
    start_node: str
    end_nodes: List[str] = []
    max_steps: int = 10
    metadata: Dict[str, Any] = {}


class ExecutionContext(BaseModel):
    """执行上下文"""
    workflow_id: str
    current_node: str
    step_count: int = 0
    node_results: Dict[str, NodeOutput] = {}
    global_context: Dict[str, Any] = {}
    finished: bool = False
    error: Optional[str] = None


class NodeOrchestrator:
    """节点编排器"""
    
    def __init__(self, config: WorkflowConfig):
        self.config = config
        self.nodes: Dict[str, NodeType] = {}
        self.edges: List[Edge] = []
        self._adjacency_list: Dict[str, List[str]] = {}
    
    def add_node(self, node: NodeType) -> None:
        """添加节点"""
        self.nodes[node.config.node_id] = node
        if node.config.node_id not in self._adjacency_list:
            self._adjacency_list[node.config.node_id] = []
        logger.info(f"Added node: {node.config.node_id}")
    
    def add_edge(self, edge: Edge) -> None:
        """添加边"""
        if edge.from_node not in self.nodes:
            raise ValueError(f"From node not found: {edge.from_node}")
        if edge.to_node not in self.nodes:
            raise ValueError(f"To node not found: {edge.to_node}")
        
        self.edges.append(edge)
        self._adjacency_list[edge.from_node].append(edge.to_node)
        logger.info(f"Added edge: {edge.from_node} -> {edge.to_node}")
    
    def get_next_nodes(self, current_node: str, context: ExecutionContext) -> List[str]:
        """获取下一个要执行的节点"""
        next_nodes = []
        
        for edge in self.edges:
            if edge.from_node == current_node:
                # 检查条件（如果有）
                if edge.condition:
                    # 这里可以实现更复杂的条件评估逻辑
                    # 目前简化为总是满足条件
                    pass
                
                next_nodes.append(edge.to_node)
        
        return next_nodes
    
    async def execute_stream(
        self,
        input_message: str,
        initial_context: Optional[Dict[str, Any]] = None
    ) -> AsyncGenerator[ChatStreamChunk, None]:
        """流式执行工作流"""
        try:
            # 初始化执行上下文
            context = ExecutionContext(
                workflow_id=f"workflow_{asyncio.get_event_loop().time()}",
                current_node=self.config.start_node,
                global_context=initial_context or {}
            )
            
            # 检查起始节点是否存在
            if self.config.start_node not in self.nodes:
                yield ChatStreamChunk(content=f"起始节点不存在: {self.config.start_node}")
                return
            
            # 执行工作流
            visited_nodes = set()
            
            while (not context.finished and 
                   context.step_count < self.config.max_steps and
                   context.current_node not in visited_nodes):
                
                context.step_count += 1
                current_node_id = context.current_node
                visited_nodes.add(current_node_id)
                
                logger.info(f"Executing node: {current_node_id} (step {context.step_count})")
                
                # 获取当前节点
                current_node = self.nodes[current_node_id]
                
                # 准备节点输入
                node_input = NodeInput(
                    message=input_message,
                    context=context.global_context,
                    previous_results={k: v.model_dump() for k, v in context.node_results.items()}
                )
                
                # 执行节点并收集输出
                node_content = ""
                
                async for chunk in current_node.execute_stream(node_input):
                    if chunk.content:
                        node_content += chunk.content
                    yield chunk
                
                # 保存节点结果
                context.node_results[current_node_id] = NodeOutput(
                    content=node_content,
                    context=context.global_context,
                    success=True
                )
                
                # 检查是否到达结束节点
                if (self.config.end_nodes and 
                    current_node_id in self.config.end_nodes):
                    context.finished = True
                    break
                
                # 获取下一个节点
                next_nodes = self.get_next_nodes(current_node_id, context)
                
                if not next_nodes:
                    # 没有下一个节点，结束执行
                    context.finished = True
                    break
                elif len(next_nodes) == 1:
                    # 单个下一节点
                    context.current_node = next_nodes[0]
                else:
                    # 多个下一节点，目前选择第一个
                    # TODO: 实现更复杂的选择逻辑
                    context.current_node = next_nodes[0]
                    logger.warning(f"Multiple next nodes found, choosing first: {next_nodes[0]}")
            
            # 检查是否因为达到最大步数而结束
            if context.step_count >= self.config.max_steps:
                yield ChatStreamChunk(content=f"\n\n(已达到最大执行步数: {self.config.max_steps})")
            
        except Exception as e:
            logger.error(f"Workflow execution error: {e}")
            yield ChatStreamChunk(content=f"工作流执行错误: {str(e)}")
    
    async def execute(
        self,
        input_message: str,
        initial_context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, NodeOutput]:
        """非流式执行工作流"""
        try:
            # 初始化执行上下文
            context = ExecutionContext(
                workflow_id=f"workflow_{asyncio.get_event_loop().time()}",
                current_node=self.config.start_node,
                global_context=initial_context or {}
            )
            
            # 检查起始节点是否存在
            if self.config.start_node not in self.nodes:
                raise ValueError(f"起始节点不存在: {self.config.start_node}")
            
            # 执行工作流
            visited_nodes = set()
            
            while (not context.finished and 
                   context.step_count < self.config.max_steps and
                   context.current_node not in visited_nodes):
                
                context.step_count += 1
                current_node_id = context.current_node
                visited_nodes.add(current_node_id)
                
                logger.info(f"Executing node: {current_node_id} (step {context.step_count})")
                
                # 获取当前节点
                current_node = self.nodes[current_node_id]
                
                # 准备节点输入
                node_input = NodeInput(
                    message=input_message,
                    context=context.global_context,
                    previous_results={k: v.model_dump() for k, v in context.node_results.items()}
                )
                
                # 执行节点
                result = await current_node.execute(node_input)
                context.node_results[current_node_id] = result
                
                # 更新全局上下文
                context.global_context.update(result.context)
                
                # 检查执行是否成功
                if not result.success:
                    logger.error(f"Node {current_node_id} failed: {result.error}")
                    context.error = result.error
                    break
                
                # 检查是否到达结束节点
                if (self.config.end_nodes and 
                    current_node_id in self.config.end_nodes):
                    context.finished = True
                    break
                
                # 获取下一个节点
                next_nodes = self.get_next_nodes(current_node_id, context)
                
                if not next_nodes:
                    # 没有下一个节点，结束执行
                    context.finished = True
                    break
                elif len(next_nodes) == 1:
                    # 单个下一节点
                    context.current_node = next_nodes[0]
                else:
                    # 多个下一节点，目前选择第一个
                    context.current_node = next_nodes[0]
                    logger.warning(f"Multiple next nodes found, choosing first: {next_nodes[0]}")
            
            return context.node_results
            
        except Exception as e:
            logger.error(f"Workflow execution error: {e}")
            return {
                "error": NodeOutput(
                    content=f"工作流执行错误: {str(e)}",
                    success=False,
                    error=str(e)
                )
            }
    
    def validate_workflow(self) -> Tuple[bool, List[str]]:
        """验证工作流配置"""
        errors = []
        
        # 检查起始节点
        if self.config.start_node not in self.nodes:
            errors.append(f"起始节点不存在: {self.config.start_node}")
        
        # 检查结束节点
        for end_node in self.config.end_nodes:
            if end_node not in self.nodes:
                errors.append(f"结束节点不存在: {end_node}")
        
        # 检查边的有效性
        for edge in self.edges:
            if edge.from_node not in self.nodes:
                errors.append(f"边的起始节点不存在: {edge.from_node}")
            if edge.to_node not in self.nodes:
                errors.append(f"边的目标节点不存在: {edge.to_node}")
        
        # 检查是否有循环（简单检查）
        # TODO: 实现更完整的循环检测
        
        return len(errors) == 0, errors
    
    def get_workflow_info(self) -> Dict[str, Any]:
        """获取工作流信息"""
        return {
            "config": self.config.model_dump(),
            "nodes": {k: v.config.model_dump() for k, v in self.nodes.items()},
            "edges": [edge.model_dump() for edge in self.edges],
            "node_count": len(self.nodes),
            "edge_count": len(self.edges)
        }