import logging
from collections.abc import AsyncGenerator

from langchain_core.messages import AIMessage, AIMessageChunk, HumanMessage

from app.agents.basic import ChatAgent, load_memory
from app.types.chat import ChatStreamChunk
from app.utils.async_interval import AsyncIntervalChecker
from app.utils.status_processor import AIMessageChunkProcessor

logger = logging.getLogger(__name__)

YIELD_INTERVAL = 0.5


# ===== 路由相关占位配置 =====
# 说明：model_id 与 prompt_id 仅占位，实际内容由外部配置（Langfuse/DB）提供
# 小模型A：二元分类，先判定是否 deep research，再判定是否 simple task（两次yes/no）
CLASSIFIER_DEEP_MODEL = "classifier-deep-research"
CLASSIFIER_DEEP_PROMPT = "classifier-deep"

CLASSIFIER_SIMPLE_MODEL = "classifier-simple-task"
CLASSIFIER_SIMPLE_PROMPT = "classifier-simple"

# 小模型B：政治敏感度二元分类（yes/no），高则进入拒绝节点
CLASSIFIER_SAFETY_MODEL = "classifier-safety"
CLASSIFIER_SAFETY_PROMPT = "classifier-safety"

# 拒绝节点
REJECT_MODEL = "chat-reject"
REJECT_PROMPT = "chat-reject"

# 三类路由目标
NORMAL_MODEL = "chat-normal"
NORMAL_PROMPT = "main"  # 含主要人设
DEEP_MODEL = "chat-deep-research"
DEEP_PROMPT = "deep-research"  # 深研提示（外部存储）
SIMPLE_MODEL = "chat-simple-task"
SIMPLE_PROMPT = "simple-task"  # 工具专注提示（外部存储）

# 工具清单占位：按要求，此处不关注工具具体内容，置空数组
NORMAL_TOOLS: list = []
DEEP_TOOLS: list = []
SIMPLE_TOOLS: list = []


def _extract_latest_user_text(messages: list) -> str:
    """提取最近一条用户文本（尽量还原为纯文本）。"""
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            content = msg.content
            if isinstance(content, str):
                return content
            # 多模态内容：尝试拼接文本段
            if isinstance(content, list):
                try:
                    text_parts = [
                        part.get("text", "")
                        for part in content
                        if isinstance(part, dict) and part.get("type") == "text"
                    ]
                    combined = "\n".join([p for p in text_parts if p])
                    if combined:
                        return combined
                except Exception:
                    pass
            # 其他情况：做降级字符串化
            return str(content)
    return ""


def _parse_yes_no(text: str) -> bool:
    """将模型输出解析为 yes/no 布尔，默认严格 yes 为真。

    约定：只要包含明显的 yes/是/true/1 等肯定语义且不含明显否定，就认为 True。
    """
    if not isinstance(text, str):
        return False
    s = text.strip().lower()
    # 简单规范化与关键词判断
    positives = ["yes", "true", "是", "y", "1"]
    negatives = ["no", "false", "否", "n", "0"]
    has_pos = any(p in s for p in positives)
    has_neg = any(n in s for n in negatives)
    if has_pos and not has_neg:
        return True
    if has_neg and not has_pos:
        return False
    # 不确定时默认否
    return False


async def _ask_yes_no(agent: ChatAgent, user_text: str) -> bool:
    """用小模型询问并解析 yes/no。提示词由外部配置，这里仅传入用户文本。

    注：实际提示词中应指示“仅回答 yes 或 no”。
    """
    msg = await agent.run([HumanMessage(content=user_text)])
    content = msg.content if isinstance(msg, AIMessage) else None
    if isinstance(content, str):
        return _parse_yes_no(content)
    return False


async def _run_single_turn(agent: ChatAgent, user_text: str) -> str:
    """执行单轮非流式调用，返回纯文本结果。"""
    msg = await agent.run([HumanMessage(content=user_text)])
    if isinstance(msg, AIMessage) and isinstance(msg.content, str):
        return msg.content
    return ""


async def stream_chat(message_id: str) -> AsyncGenerator[ChatStreamChunk, None]:
    """主入口：加入模型路由与安全拒绝，并由 normal chat 负责最终流式输出。

    路由策略：
    - 节点B（政治敏感）：yes -> 拒绝节点 -> 直接一次性输出；no -> 继续
    - 节点A（任务类型）：先判 deep，是则走 deep；否则判 simple，是则走 simple；否则 normal
    - deep/simple 的结果以中间内容注入 normal chat，再由 normal chat 流式输出

    提示词均为外部存储（Langfuse），这里只引用 prompt_id，占位不写具体提示内容。
    """

    messages, image_urls = await load_memory(message_id)
    logger.info(f"Loaded {len(messages)} messages and {len(image_urls or [])} images")

    # 1) 提取用户最新请求文本
    latest_user_text = _extract_latest_user_text(messages)

    # 2) 小模型B：政治敏感二元分类
    try:
        safety_agent = ChatAgent(CLASSIFIER_SAFETY_MODEL, CLASSIFIER_SAFETY_PROMPT, [])
        is_sensitive = await _ask_yes_no(safety_agent, latest_user_text)
    except Exception as e:
        logger.warning(f"safety classifier failed, fallback to non-sensitive: {e}")
        is_sensitive = False

    # 3) 若敏感，走拒绝节点并直接返回单次输出
    if is_sensitive:
        try:
            reject_agent = ChatAgent(REJECT_MODEL, REJECT_PROMPT, [])
            reject_text = await _run_single_turn(reject_agent, latest_user_text)
            yield ChatStreamChunk(content=reject_text or "小尾有点不想讨论这个话题呢~")
            return
        except Exception as e:
            logger.error(f"reject node failed: {e}")
            yield ChatStreamChunk(content="小尾有点不想讨论这个话题呢~")
            return

    # 4) 节点A：两级二元分类（deep? 否则 simple?）
    route = "normal"
    try:
        deep_cls_agent = ChatAgent(CLASSIFIER_DEEP_MODEL, CLASSIFIER_DEEP_PROMPT, [])
        is_deep = await _ask_yes_no(deep_cls_agent, latest_user_text)
        if is_deep:
            route = "deep"
        else:
            simple_cls_agent = ChatAgent(CLASSIFIER_SIMPLE_MODEL, CLASSIFIER_SIMPLE_PROMPT, [])
            is_simple = await _ask_yes_no(simple_cls_agent, latest_user_text)
            route = "simple" if is_simple else "normal"
    except Exception as e:
        logger.warning(f"task-type classifier failed, fallback to normal: {e}")
        route = "normal"

    # 5) 若 deep/simple，先执行一次非流式获取中间结果
    intermediate_text = ""
    if route == "deep":
        try:
            deep_agent = ChatAgent(DEEP_MODEL, DEEP_PROMPT, DEEP_TOOLS)
            intermediate_text = await _run_single_turn(deep_agent, latest_user_text)
        except Exception as e:
            logger.warning(f"deep agent failed, fallback to normal: {e}")
            route = "normal"
    elif route == "simple":
        try:
            simple_agent = ChatAgent(SIMPLE_MODEL, SIMPLE_PROMPT, SIMPLE_TOOLS)
            intermediate_text = await _run_single_turn(simple_agent, latest_user_text)
        except Exception as e:
            logger.warning(f"simple agent failed, fallback to normal: {e}")
            route = "normal"

    # 6) 构造 normal chat + 可选中间结果的流式输出
    try:
        normal_agent = ChatAgent(NORMAL_MODEL, NORMAL_PROMPT, NORMAL_TOOLS)

        # 将中间结果注入为额外的人类消息，确保 persona 由 normal chat 控制
        augmented_messages = list(messages)
        if intermediate_text:
            augmented_messages.append(
                HumanMessage(
                    content=(
                        "[系统中间结果，仅供参考，不要直接复述原文]"\
                        "\n" + intermediate_text
                    )
                )
            )

        accumulate_chunk = ChatStreamChunk(
            content="",
            reason_content="",
        )
        interval_checker = AsyncIntervalChecker(YIELD_INTERVAL)
        processor = AIMessageChunkProcessor()
        should_continue = True

        async for token in normal_agent.stream(
            augmented_messages,
            context={
                "curr_message_id": message_id,
                "image_url_list": image_urls,
            },
        ):
            if isinstance(token, AIMessageChunk):
                finish_reason = token.response_metadata.get("finish_reason")

                if finish_reason == "stop":
                    yield accumulate_chunk
                    should_continue = False
                elif finish_reason == "content_filter":
                    yield ChatStreamChunk(content="小尾有点不想讨论这个话题呢~")
                    should_continue = False
                elif finish_reason == "length":
                    yield ChatStreamChunk(content="(后续内容被截断)")
                    should_continue = False

                if not should_continue:
                    continue

                status_message = processor.process_chunk(token)
                if status_message:
                    yield ChatStreamChunk(status_message=status_message)

                accumulate_chunk.content += token.content or ""  # type: ignore

                if interval_checker.check():
                    yield accumulate_chunk

    except Exception as e:
        import traceback
        logger.error(f"stream_chat error: {str(e)}\n{traceback.format_exc()}")
        yield ChatStreamChunk(content="赤尾好像遇到了一些问题呢QAQ")
