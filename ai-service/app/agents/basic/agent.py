from collections.abc import AsyncGenerator
from datetime import datetime
from typing import TypeVar

from langchain.agents import create_react_agent
from langchain_core.messages import AIMessage, AIMessageChunk, ToolMessage
from langfuse.langchain import CallbackHandler
from pydantic import BaseModel

from app.agents.basic.context import ContextSchema
from app.agents.basic.langfuse import get_prompt
from app.agents.basic.model_builder import ModelBuilder

T = TypeVar("T", bound=BaseModel)


class ChatAgent:
    def __init__(
        self,
        model_id: str,
        prompt_id: str,
        tools: list,
        structured_output_schema: type[BaseModel] | None = None,
    ):
        self.model_id = model_id
        self.prompt_id = prompt_id
        self.tools = tools
        self.structured_output_schema = structured_output_schema
        self._langfuse_handler = CallbackHandler()
        self._agent = None  # 缓存agent实例

    async def _init_agent(self, **prompt_vars):
        model = await ModelBuilder.build_chat_model(self.model_id)

        # 如果指定了结构化输出schema，则绑定到模型上
        if self.structured_output_schema:
            model = model.with_structured_output(self.structured_output_schema)

        prompt = get_prompt(self.prompt_id).get_langchain_prompt(
            currDate=datetime.now().strftime("%Y-%m-%d"),
            currTime=datetime.now().strftime("%H:%M:%S"),
            **prompt_vars,
        )
        self._agent = create_react_agent(
            model, self.tools, prompt=prompt, context_schema=ContextSchema
        )

    async def stream(
        self,
        messages: list,
        context: dict | None = None,
        prompt_vars: dict | None = None,
    ) -> AsyncGenerator[AIMessageChunk | ToolMessage, None]:
        await self._init_agent(**(prompt_vars or {}))
        async for token, _ in self._agent.astream(
            {"messages": messages, "context": context},
            stream_mode="messages",
            config={"callbacks": [self._langfuse_handler]},
        ):
            yield token  # type: ignore

    async def run(self, messages: list, prompt_vars: dict | None = None) -> AIMessage:
        await self._init_agent(**(prompt_vars or {}))
        all_message = await self._agent.ainvoke(
            {"messages": messages}, config={"callbacks": [self._langfuse_handler]}
        )
        return all_message["messages"][-1]

    async def run_structured(
        self, messages: list, prompt_vars: dict | None = None
    ) -> BaseModel:
        """
        运行agent并返回结构化输出结果

        Args:
            messages: 输入消息列表
            prompt_vars: 提示变量

        Returns:
            结构化输出结果（Pydantic模型实例）
        """
        if not self.structured_output_schema:
            raise ValueError(
                "未指定结构化输出schema，请在初始化时提供structured_output_schema参数"
            )

        await self._init_agent(**(prompt_vars or {}))
        result = await self._agent.ainvoke(
            {"messages": messages}, config={"callbacks": [self._langfuse_handler]}
        )
        return result["messages"][-1]
