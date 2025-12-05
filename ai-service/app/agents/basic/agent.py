from collections.abc import AsyncGenerator
from datetime import datetime

from langchain.agents import create_agent
from langchain.messages import AIMessage, AIMessageChunk, ToolMessage
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
    ):
        self.model_id = model_id
        self.prompt_id = prompt_id
        self.tools = tools
        self._langfuse_handler = CallbackHandler()
        self._agent = None  # 缓存agent实例

    async def _init_agent(self, **prompt_vars):
        langfuse_prompt = get_prompt(self.prompt_id)
        if langfuse_prompt.config.get("model_name"):
            self.model_id = langfuse_prompt.config.get("model_name")

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

    async def stream(
        self,
        messages: list,
        context: ContextSchema | None = None,
        prompt_vars: dict | None = None,
    ) -> AsyncGenerator[AIMessageChunk | ToolMessage, None]:
        await self._init_agent(**(prompt_vars or {}))
        async for (
            token,
            _,
        ) in self._agent.astream(  # pyright: ignore[reportOptionalMemberAccess]
            {"messages": messages},
            context=context,
            stream_mode="messages",
            config={"callbacks": [self._langfuse_handler]},
        ):
            yield token  # type: ignore

    async def run(
        self,
        messages: list,
        context: ContextSchema | None = None,
        prompt_vars: dict | None = None,
    ) -> AIMessage:
        await self._init_agent(**(prompt_vars or {}))
        all_message = await self._agent.ainvoke(  # pyright: ignore[reportOptionalMemberAccess]
            {"messages": messages},
            context=context,
            config={"callbacks": [self._langfuse_handler]},
        )
        return all_message["messages"][-1]
