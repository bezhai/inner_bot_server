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
    cron_2h_scan_profile_pending,
    task_evolve_memory,
    task_update_profile,
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
        # L2 话题更新
        task_update_topic_memory,
        # 画像更新任务
        task_update_profile,
        # 废弃的L3记忆更新（保留用于兼容）
        task_evolve_memory,
    ]

    # 所有定时任务
    cron_jobs = [
        # 长期任务：每分钟执行一次
        cron(task_executor_job, minute=set(range(60))),
        # 画像更新：每2小时扫描一次
        cron(
            cron_2h_scan_profile_pending,
            hour=set(range(0, 24, settings.profile_update_interval_hours)),
            minute=0,
        ),
    ]
