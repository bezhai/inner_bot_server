import logging

from langchain_core.messages import AIMessage, HumanMessage

from app.agents.basic import ChatAgent
from app.agents.main import config


logger = logging.getLogger(__name__)


def _parse_yes_no(text: str) -> bool:
    if not isinstance(text, str):
        return False
    s = text.strip().lower()
    if s.startswith("yes") or s == "y":
        return True
    if s.startswith("no") or s == "n":
        return False
    # fallback: conservative
    return False


async def extract_latest_user_text(messages: list) -> str:
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            content = msg.content
            if isinstance(content, str):
                return content
            if isinstance(content, list):
                try:
                    parts = [
                        p.get("text", "")
                        for p in content
                        if isinstance(p, dict) and p.get("type") == "text"
                    ]
                    joined = "\n".join([p for p in parts if p])
                    if joined:
                        return joined
                except Exception:
                    pass
            return str(content)
    return ""


async def classify_safety(latest_user_text: str) -> bool:
    try:
        agent = ChatAgent(config.CLASSIFIER_SAFETY_MODEL, config.CLASSIFIER_SAFETY_PROMPT, [])
        msg = await agent.run([HumanMessage(content=latest_user_text)])
        content = msg.content if isinstance(msg, AIMessage) else None
        return _parse_yes_no(content or "")
    except Exception as e:
        logger.warning(f"classify_safety failed: {e}")
        return False


async def classify_task_type(latest_user_text: str) -> str:
    try:
        deep_agent = ChatAgent(config.CLASSIFIER_DEEP_MODEL, config.CLASSIFIER_DEEP_PROMPT, [])
        deep_msg = await deep_agent.run([HumanMessage(content=latest_user_text)])
        if _parse_yes_no(deep_msg.content or ""):
            return "deep"
        simple_agent = ChatAgent(
            config.CLASSIFIER_SIMPLE_MODEL, config.CLASSIFIER_SIMPLE_PROMPT, []
        )
        simple_msg = await simple_agent.run([HumanMessage(content=latest_user_text)])
        return "simple" if _parse_yes_no(simple_msg.content or "") else "normal"
    except Exception as e:
        logger.warning(f"classify_task_type failed: {e}")
        return "normal"


async def run_reject(latest_user_text: str) -> str:
    try:
        agent = ChatAgent(config.REJECT_MODEL, config.REJECT_PROMPT, [])
        msg = await agent.run([HumanMessage(content=latest_user_text)])
        return msg.content if isinstance(msg, AIMessage) and isinstance(msg.content, str) else ""
    except Exception as e:
        logger.error(f"run_reject failed: {e}")
        return ""


async def run_deep(latest_user_text: str) -> str:
    try:
        agent = ChatAgent(config.DEEP_MODEL, config.DEEP_PROMPT, config.DEEP_TOOLS)
        msg = await agent.run([HumanMessage(content=latest_user_text)])
        return msg.content if isinstance(msg, AIMessage) and isinstance(msg.content, str) else ""
    except Exception as e:
        logger.warning(f"run_deep failed: {e}")
        return ""


async def run_simple(latest_user_text: str) -> str:
    try:
        agent = ChatAgent(config.SIMPLE_MODEL, config.SIMPLE_PROMPT, config.SIMPLE_TOOLS)
        msg = await agent.run([HumanMessage(content=latest_user_text)])
        return msg.content if isinstance(msg, AIMessage) and isinstance(msg.content, str) else ""
    except Exception as e:
        logger.warning(f"run_simple failed: {e}")
        return ""

