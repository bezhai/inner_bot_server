"""
智能记忆管理配置
"""

from pydantic_settings import BaseSettings


class MemoryConfig(BaseSettings):
    """智能记忆管理配置类"""

    # 上下文构建配置
    max_context_messages: int = 20  # 最大上下文消息数
    time_window_hours: int = 24  # 时间窗口（小时）
    relevance_threshold: float = 0.3  # 相关性阈值

    # 相关性评分权重
    reply_chain_weight: float = 0.4  # 回复链权重
    user_continuity_weight: float = 0.15  # 用户连续性权重
    time_decay_weight: float = 0.2  # 时间衰减权重
    mention_relation_weight: float = 0.15  # @关系权重
    keyword_overlap_weight: float = 0.1  # 关键词重叠权重

    # 性能配置
    context_build_timeout_seconds: int = 5  # 上下文构建超时时间
    enable_async_data_collection: bool = True  # 是否启用异步数据收集

    # 数据收集配置
    enable_data_collection: bool = True  # 是否启用数据收集
    sample_rate: float = 1.0  # 数据采样率

    # 用户连续性判断配置
    user_continuity_window_minutes: int = 5  # 用户连续发言时间窗口（分钟）

    # 时间衰减配置
    time_decay_factor: float = 0.1  # 时间衰减因子

    class Config:
        env_prefix = "MEMORY_"


# 全局配置实例
memory_config = MemoryConfig()
