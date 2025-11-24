from collections.abc import AsyncGenerator
from datetime import datetime
from typing import TypeVar

from langchain.agents import create_agent
from langchain.messages import AIMessage, AIMessageChunk, ToolMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langfuse.langchain import CallbackHandler
from pydantic import BaseModel

from app.agents.basic.context import ContextSchema
from app.agents.basic.langfuse import get_prompt
from app.agents.basic.model_builder import ModelBuilder

T = TypeVar("T", bound=BaseModel)


class ChatAgent:
    def __init__(
        self,
        prompt_id: str,
        tools: list,
        model_id: str | None = None,
        structured_output_schema: type[BaseModel] | None = None,
    ):
        self.model_id = model_id
        self.prompt_id = prompt_id
        self.tools = tools
        self.structured_output_schema = structured_output_schema
        self._langfuse_handler = CallbackHandler()
        self._agent = None  # 缓存agent实例
        self._model = None
        self._prompt = None

    async def _init_agent(self, **prompt_vars):
        langfuse_prompt = get_prompt(self.prompt_id)
        if langfuse_prompt.config.get("model_name"):
            self.model_id = langfuse_prompt.config.get("model_name")

        model = await ModelBuilder.build_chat_model(self.model_id)

        prompt = langfuse_prompt.get_langchain_prompt(
            currDate=datetime.now().strftime("%Y-%m-%d"),
            currTime=datetime.now().strftime("%H:%M:%S"),
            **prompt_vars,
        )

        self._model = model
        self._prompt = prompt

        self._agent = create_agent(
            model, self.tools, system_prompt=prompt, context_schema=ContextSchema
        )

    async def stream(
        self,
        messages: list,
        context: dict | None = None,
        prompt_vars: dict | None = None,
    ) -> AsyncGenerator[AIMessageChunk | ToolMessage, None]:
        await self._init_agent(**(prompt_vars or {}))
        async for token, _ in self._agent.astream(
            {"messages": messages},
            context=context,
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
        if not self.structured_output_schema:
            raise ValueError("未指定结构化输出schema")

        await self._init_agent(**(prompt_vars or {}))

        # 动态构建专用 Chain：Prompt + Structured LLM
        prompt_runnable = ChatPromptTemplate.from_messages(
            [
                ("system", self._prompt),  # 注入系统提示词
                MessagesPlaceholder("messages"),  # 为输入的 messages 列表预留位置
            ]
        )
        chain = prompt_runnable | self._model.with_structured_output(
            self.structured_output_schema
        )

        return await chain.ainvoke(
            {"messages": messages}, config={"callbacks": [self._langfuse_handler]}
        )
