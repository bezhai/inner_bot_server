from collections.abc import AsyncGenerator
from datetime import datetime

from langchain.agents import create_agent
from langchain.messages import AIMessage, AIMessageChunk, ToolMessage
from langchain_core.runnables import RunnableConfig
from langfuse.langchain import CallbackHandler

from app.agents.basic.context import ContextSchema
from app.agents.basic.langfuse import get_prompt
from app.agents.basic.model_builder import ModelBuilder


class ChatAgent:
    def __init__(
        self,
        prompt_id: str,
        tools: list,
        model_id: str | None = None,
        trace_name: str | None = None,
    ):
        self.model_id = model_id
        self.prompt_id = prompt_id
        self.tools = tools
        self.trace_name = trace_name
        self._agent = None  # 缓存agent实例

    async def _init_agent(self, **prompt_vars):
        langfuse_prompt = get_prompt(self.prompt_id)

        assert self.model_id is not None, "Model ID must be specified"

        model = await ModelBuilder.build_chat_model(self.model_id)

        prompt = langfuse_prompt.get_langchain_prompt(
            currDate=datetime.now().strftime("%Y-%m-%d"),
            currTime=datetime.now().strftime("%H:%M:%S"),
            **prompt_vars,
        )

        self._agent = create_agent(
            model, self.tools, system_prompt=prompt, context_schema=ContextSchema
        )

    def _build_config(self, parent_config: RunnableConfig | None = None) -> dict:
        """构建运行配置，支持继承父级 config 的 callbacks"""
        if parent_config:
            # 从父级 config 继承 callbacks，保持 trace 链路
            config: dict = dict(parent_config)
            if self.trace_name:
                config["run_name"] = self.trace_name
        else:
            # 根 agent：创建新的 langfuse handler
            config = {"callbacks": [CallbackHandler(update_trace=True)]}
            if self.trace_name:
                config["run_name"] = self.trace_name
        return config

    async def stream(
        self,
        messages: list,
        context: ContextSchema | None = None,
        prompt_vars: dict | None = None,
        config: RunnableConfig | None = None,
    ) -> AsyncGenerator[AIMessageChunk | ToolMessage, None]:
        await self._init_agent(**(prompt_vars or {}))

        run_config = self._build_config(config)

        assert self._agent is not None  # for mypy type checking

        async for (
            token,
            _,
        ) in self._agent.astream(  # pyright: ignore[reportOptionalMemberAccess]
            {"messages": messages},
            context=context,
            stream_mode="messages",
            config=run_config,  # pyright: ignore[reportArgumentType]
        ):
            yield token  # type: ignore

    async def run(
        self,
        messages: list,
        context: ContextSchema | None = None,
        prompt_vars: dict | None = None,
        config: RunnableConfig | None = None,
    ) -> AIMessage:
        await self._init_agent(**(prompt_vars or {}))

        run_config = self._build_config(config)

        assert self._agent is not None  # for mypy type checking

        all_message = await self._agent.ainvoke(  # pyright: ignore[reportOptionalMemberAccess]
            {"messages": messages},
            context=context,
            config=run_config,  # pyright: ignore[reportArgumentType]
        )
        return all_message["messages"][-1]
