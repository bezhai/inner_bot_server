from arq import cron
from arq.connections import RedisSettings

from app.config.config import settings

from .executor import poll_and_execute_tasks


async def task_executor_job(ctx) -> None:
    """arq 定时任务：每分钟执行一次任务轮询"""
    await poll_and_execute_tasks(batch_size=5, lock_timeout_seconds=1800)


class LongTaskWorkerSettings:
    """
    长期任务 Worker 配置

    启动命令：
        arq app.long_tasks.worker.LongTaskWorkerSettings
    """

    redis_settings = RedisSettings(
        host=settings.redis_host or "localhost",
        port=6379,
        password=settings.redis_password,
        database=0,
    )

    functions = []  # 不需要手动入队的任务函数

    cron_jobs = [
        cron(task_executor_job, minute="*"),  # 每分钟执行一次
    ]
