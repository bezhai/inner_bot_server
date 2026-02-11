"""Post-processing MQ consumer

消费 safety_check queue，执行输出安全检测，
不安全时发布 recall 消息到 main-server worker。
"""

import json
import logging

from aio_pika.abc import AbstractIncomingMessage

from app.agents.graphs.post import run_post_safety
from app.clients.rabbitmq import (
    QUEUE_SAFETY_CHECK,
    RK_RECALL,
    RabbitMQClient,
)

logger = logging.getLogger(__name__)


async def handle_safety_check(message: AbstractIncomingMessage) -> None:
    """消费 safety_check queue 中的消息"""
    async with message.process(requeue=False):
        body = json.loads(message.body)
        session_id = body.get("session_id")
        response_text = body.get("response_text", "")
        chat_id = body.get("chat_id")
        trigger_message_id = body.get("trigger_message_id")

        logger.info("Post safety check: session_id=%s", session_id)

        result = await run_post_safety(response_text)

        if result.blocked:
            logger.warning(
                "Post safety blocked: session_id=%s, reason=%s",
                session_id,
                result.reason,
            )
            client = RabbitMQClient.get_instance()
            await client.publish(
                RK_RECALL,
                {
                    "session_id": session_id,
                    "chat_id": chat_id,
                    "trigger_message_id": trigger_message_id,
                    "reason": result.reason,
                    "detail": result.detail,
                },
            )
        else:
            logger.info("Post safety passed: session_id=%s", session_id)


async def start_post_consumer() -> None:
    """启动 post processing consumer"""
    client = RabbitMQClient.get_instance()
    await client.connect()
    await client.declare_topology()
    await client.consume(QUEUE_SAFETY_CHECK, handle_safety_check)
    logger.info("Post safety consumer started")
