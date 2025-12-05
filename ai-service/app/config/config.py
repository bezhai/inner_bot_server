from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    redis_host: str | None = None
    redis_password: str | None = None
    stream_timeout: int = 300  # 流式请求超时时间，默认5分钟（300秒）

    # 数据库配置
    postgres_host: str | None = None
    postgres_port: int = 5432
    postgres_user: str | None = None
    postgres_password: str | None = None
    postgres_db: str | None = None

    # Qdrant配置
    qdrant_service_host: str | None = None
    qdrant_service_port: int = 6333
    qdrant_service_api_key: str | None = None

    search_api_key: str | None = None

    bangumi_access_token: str | None = None

    inner_http_secret: str | None = None

    # Main-server配置
    main_server_base_url: str | None = None  # Main-server服务基础URL
    main_server_timeout: int = 10  # 超时时间，默认10秒

    langfuse_public_key: str | None = None
    langfuse_secret_key: str | None = None
    langfuse_host: str | None = None

    # L2 话题刷新策略配置
    l2_queue_trigger_threshold: int = 10
    l2_force_update_after_minutes: int = 60
    l2_scan_interval_minutes: int = 5
    l2_queue_max_len: int = 200

    # L3 画像刷新策略
    l3_profile_min_messages: int = 10
    l3_profile_scan_interval_minutes: int = 120
    l3_profile_force_after_hours: int = 12
    l3_profile_message_limit: int = 3000
    l3_profile_redis_prefix: str = "l3:profile"

    # 长期任务配置
    long_task_batch_size: int = 5
    long_task_lock_timeout: int = 1800  # 30分钟

    class Config:
        env_file = ".env"
        extra = "ignore"


# 实例化 settings 对象
settings = Settings()
