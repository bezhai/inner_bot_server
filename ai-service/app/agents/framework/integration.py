"""
Agent Framework 与现有服务的集成适配器
"""

import logging
from collections.abc import AsyncGenerator
from typing import Any, Dict, Optional

from .adapters.model import ModelConfig, ModelProvider
from .adapters.tool import ToolFilter, ToolTag
from .core.react_agent import ReactAgent, SimpleAgent
from .core.multi_model_agent import MultiModelAgent
from .core.node import NodeConfig, AgentNode
from .core.orchestrator import WorkflowConfig, NodeOrchestrator
from .core.agent import AgentConfig

from app.types.chat import ChatStreamChunk
from app.services.chat.prompt import ChatPromptService

logger = logging.getLogger(__name__)


class FrameworkService:
    """Agent 框架服务"""
    
    def __init__(self):
        self._agents: Dict[str, Any] = {}
        self._workflows: Dict[str, NodeOrchestrator] = {}
    
    async def create_default_agents(self) -> None:
        """创建默认的 Agent 配置"""
        # 默认模型配置
        default_models = [
            ModelConfig(
                model_id="302.ai/gpt-4.1",
                provider=ModelProvider.OPENAI,
                temperature=0.7
            ),
            ModelConfig(
                model_id="Moonshot/kimi-k2-0711-preview", 
                provider=ModelProvider.OPENAI,
                temperature=0.7
            ),
        ]
        
        # 创建简单助手
        simple_config = AgentConfig(
            name="简单助手",
            description="我是赤尾，一个AI助手，可以帮助你解答问题。",
            model_configs=default_models,
            enable_memory=True
        )
        self._agents["simple"] = SimpleAgent(simple_config)
        
        # 创建智能助手（带工具）
        react_config = AgentConfig(
            name="智能助手",
            description="我是赤尾，一个智能AI助手，可以使用各种工具来帮助你完成任务。",
            model_configs=default_models,
            tool_filter=ToolFilter(enabled_only=True),
            max_iterations=5,
            enable_memory=True
        )
        self._agents["react"] = ReactAgent(react_config)
        
        # 创建多模型回退助手
        multi_model_config = AgentConfig(
            name="多模型助手",
            description="我是赤尾，一个支持多模型回退的AI助手。",
            model_configs=default_models,
            tool_filter=ToolFilter(enabled_only=True),
            max_iterations=5,
            enable_memory=True
        )
        self._agents["multi_model"] = MultiModelAgent(multi_model_config)
        
        # 创建 Bangumi 专用助手
        bangumi_config = AgentConfig(
            name="Bangumi助手",
            description="我是专门处理 ACG 相关查询的助手，可以帮你查询动漫、游戏等信息。",
            model_configs=default_models,
            tool_filter=ToolFilter(include_tags={ToolTag.BANGUMI}, enabled_only=True),
            max_iterations=3,
            enable_memory=True
        )
        self._agents["bangumi"] = ReactAgent(bangumi_config)
        
        logger.info("Created default agents: simple, react, bangumi")
    
    def get_agent(self, agent_type: str) -> Optional[Any]:
        """获取 Agent"""
        return self._agents.get(agent_type)
    
    async def process_with_agent(
        self,
        agent_type: str,
        message: str,
        context: Optional[Dict[str, Any]] = None
    ) -> AsyncGenerator[ChatStreamChunk, None]:
        """使用指定 Agent 处理消息"""
        agent = self.get_agent(agent_type)
        if agent is None:
            yield ChatStreamChunk(content=f"未找到 Agent: {agent_type}")
            return
        
        async for chunk in agent.process_stream(message, context):
            yield chunk
    
    async def create_bangumi_workflow(self) -> str:
        """创建 Bangumi 查询工作流"""
        # 工作流配置
        workflow_config = WorkflowConfig(
            name="Bangumi查询工作流",
            description="专门处理 ACG 相关查询的工作流",
            start_node="classifier",
            end_nodes=["bangumi_agent"],
            max_steps=5
        )
        
        # 创建编排器
        orchestrator = NodeOrchestrator(workflow_config)
        
        # 分类器节点 - 判断是否为 Bangumi 查询
        classifier_config = AgentConfig(
            name="查询分类器",
            description="""你是一个查询分类器，判断用户的查询是否与 ACG（动漫、游戏、轻小说）相关。
如果是 ACG 相关查询，回复 "BANGUMI"，否则回复 "GENERAL"。
只回复分类结果，不要其他内容。""",
            model_configs=[ModelConfig(
                model_id="302.ai/gpt-4o-mini",
                provider=ModelProvider.OPENAI,
                temperature=0.1
            )],
            enable_memory=False
        )
        
        classifier_agent = create_agent("simple", classifier_config)
        classifier_node = AgentNode(
            config=NodeConfig(
                node_id="classifier",
                name="查询分类器",
                description="分类用户查询"
            ),
            agent=classifier_agent
        )
        
        # Bangumi 专用节点
        bangumi_agent = self.get_agent("bangumi")
        bangumi_node = AgentNode(
            config=NodeConfig(
                node_id="bangumi_agent",
                name="Bangumi助手",
                description="处理 ACG 相关查询"
            ),
            agent=bangumi_agent
        )
        
        # 添加节点
        orchestrator.add_node(classifier_node)
        orchestrator.add_node(bangumi_node)
        
        # 添加边（这里简化，直接连接到 bangumi_agent）
        from .core.orchestrator import Edge
        orchestrator.add_edge(Edge(
            from_node="classifier",
            to_node="bangumi_agent"
        ))
        
        # 保存工作流
        workflow_id = "bangumi_workflow"
        self._workflows[workflow_id] = orchestrator
        
        logger.info(f"Created Bangumi workflow: {workflow_id}")
        return workflow_id
    
    async def execute_workflow(
        self,
        workflow_id: str,
        message: str,
        context: Optional[Dict[str, Any]] = None
    ) -> AsyncGenerator[ChatStreamChunk, None]:
        """执行工作流"""
        workflow = self._workflows.get(workflow_id)
        if workflow is None:
            yield ChatStreamChunk(content=f"未找到工作流: {workflow_id}")
            return
        
        async for chunk in workflow.execute_stream(message, context):
            yield chunk
    
    async def replace_current_chat_service(
        self,
        message_id: str,
        agent_type: str = "multi_model",
        yield_interval: float = 0.5,
    ) -> AsyncGenerator[ChatStreamChunk, None]:
        """替换当前的聊天服务实现 - 使用 Agent 层"""
        try:
            # 使用多模型回退 Agent，它包含了原有的所有逻辑
            agent = self.get_agent(agent_type) or self.get_agent("multi_model")
            
            context = {"message_id": message_id}
            
            async for chunk in agent.process_stream("", context):
                yield chunk
                
        except Exception as e:
            logger.error(f"Framework service error: {e}")
            yield ChatStreamChunk(content=f"框架服务错误: {str(e)}")


# 全局实例
_framework_service = None


async def get_framework_service() -> FrameworkService:
    """获取框架服务单例"""
    global _framework_service
    if _framework_service is None:
        _framework_service = FrameworkService()
        await _framework_service.create_default_agents()
    return _framework_service


async def init_framework_service() -> None:
    """初始化框架服务"""
    await get_framework_service()
    logger.info("Agent framework service initialized")