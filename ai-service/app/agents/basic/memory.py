from langchain_core.messages import AIMessage, HumanMessage

from app.clients import memory_client


async def load_memory(message_id: str) -> list[AIMessage | HumanMessage]:
    results = await memory_client.quick_search(
        context_message_id=message_id,
        max_results=15,
    )

    messages = []
    for result in results:
        content = (
            f"[{result.get('user_name', '未知用户')}]: {result.get('content', '')}"
        )
        if result.get("role") == "user":
            messages.append(HumanMessage(content=content))
        else:
            messages.append(AIMessage(content=content))
    return messages
