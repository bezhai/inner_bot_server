from collections.abc import AsyncGenerator
from datetime import datetime

from langchain_core.messages import AIMessage, AIMessageChunk, ToolMessage
from langfuse.langchain import CallbackHandler
from langgraph.prebuilt import create_react_agent

from app.agents.basic.context import ContextSchema
from app.agents.basic.langfuse import get_prompt
from app.agents.basic.model_builder import ModelBuilder


class ChatAgent:
    def __init__(self, model_id: str, prompt_id: str, tools: list):
        self.model_id = model_id
        self.prompt_id = prompt_id
        self.tools = tools
        self._langfuse_handler = CallbackHandler()

    async def _init_agent(self):
        model = await ModelBuilder.build_chat_model(self.model_id)
        prompt = get_prompt(self.prompt_id).get_langchain_prompt(
            currDate=datetime.now().strftime("%Y-%m-%d"),
            currTime=datetime.now().strftime("%H:%M:%S"),
        )
        self.agent = create_react_agent(
            model, self.tools, prompt=prompt, context_schema=ContextSchema
        )

    async def stream(
        self, messages: list, context: dict | None = None
    ) -> AsyncGenerator[AIMessageChunk | ToolMessage, None]:
        await self._init_agent()
        async for token, _ in self.agent.astream(
            {"messages": messages, "context": context},
            stream_mode="messages",
            config={"callbacks": [self._langfuse_handler]},
        ):
            yield token  # type: ignore

    async def run(self, messages: list) -> AIMessage:
        await self._init_agent()
        all_message = await self.agent.ainvoke(
            {"messages": messages}, config={"callbacks": [self._langfuse_handler]}
        )
        return all_message["messages"][-1]
