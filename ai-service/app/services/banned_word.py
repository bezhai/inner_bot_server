"""封禁词检测服务"""

from app.clients.redis import AsyncRedisClient

BANNED_WORDS_KEY = "banned_words"


async def check_banned_word(text: str) -> str | None:
    """检查文本是否包含封禁词，返回匹配到的封禁词或None"""
    redis = AsyncRedisClient.get_instance()
    banned_words = await redis.smembers(BANNED_WORDS_KEY)  # type: ignore
    if not banned_words:
        return None
    for word in banned_words:
        if word in text:
            return word
    return None
