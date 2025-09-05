from collections.abc import AsyncGenerator

from langchain_core.messages import AIMessage, AIMessageChunk, ToolMessage
from langgraph.prebuilt import create_react_agent

from app.agents.basic.model_builder import ModelBuilder
from app.agents.basic.prompt import PromptService


class ChatAgent:
    def __init__(self, model_id: str, prompt_id: str, tools: list):
        self.model_id = model_id
        self.prompt_id = prompt_id
        self.tools = tools

    async def _init_agent(self):
        model = await ModelBuilder.build_chat_model(self.model_id)
        prompt = await PromptService.get_prompt(self.prompt_id)
        self.agent = create_react_agent(model, self.tools, prompt=prompt)

    async def stream(
        self, messages: list
    ) -> AsyncGenerator[AIMessageChunk | ToolMessage, None]:
        await self._init_agent()
        async for token, _ in self.agent.astream(
            {"messages": messages}, stream_mode="messages"
        ):
            yield token  # type: ignore

    async def run(self, messages: list) -> AIMessage:
        await self._init_agent()
        all_message = await self.agent.ainvoke({"messages": messages})
        return all_message["messages"][-1]
