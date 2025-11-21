"""
统一的 ARQ Worker 配置
整合了长期任务（long_tasks）和记忆系统（memory）的所有worker功能

启动命令：
    arq app.workers.unified_worker.UnifiedWorkerSettings
"""

from arq import cron
from arq.connections import RedisSettings

from app.config.config import settings

# 导入长期任务相关
from app.long_tasks.executor import poll_and_execute_tasks

# 导入记忆系统相关
from app.memory.worker import (
    # cron_5m_scan_queues,
    # cron_daily_memory_evolve,
    task_evolve_memory,
    task_update_topic_memory,
)


# ==================== 长期任务相关 ====================
async def task_executor_job(ctx) -> None:
    """arq 定时任务：每分钟执行一次任务轮询"""
    await poll_and_execute_tasks(batch_size=5, lock_timeout_seconds=1800)


# ==================== Worker 配置 ====================
class UnifiedWorkerSettings:
    """
    统一的 Worker 配置
    整合了长期任务和记忆系统的所有功能

    启动命令：
        arq app.workers.unified_worker.UnifiedWorkerSettings
    """

    redis_settings = RedisSettings(
        host=settings.redis_host or "localhost",
        port=6379,
        password=settings.redis_password,
        database=0,
    )

    # 所有任务函数
    functions = [
        # 记忆系统任务
        task_update_topic_memory,
        task_evolve_memory,
    ]

    # 所有定时任务
    cron_jobs = [
        # 长期任务：每分钟执行一次
        cron(task_executor_job, minute=set(range(60))),
        # 记忆系统：每5分钟扫描L2队列
        # cron(cron_5m_scan_queues, minute=f"*/{settings.l2_scan_interval_minutes}"),
        # 记忆系统：每天凌晨2点执行记忆演进
        # cron(cron_daily_memory_evolve, hour=2, minute=0),
    ]
