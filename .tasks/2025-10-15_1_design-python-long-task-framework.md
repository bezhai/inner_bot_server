# 背景
文件名：2025-10-15_1
创建于：2025-10-15_16:31:13
创建者：ubuntu
主分支：main
任务分支：cursor/design-python-background-task-framework-35e2
Yolo模式：Off
flow: standard

# 任务描述
设计并实现一个基于 Python 的长期、多步骤任务执行框架。该框架应具备任务注册、异步提交、后台执行、状态管理和结果持久化（使用 PostgreSQL）的能力。

## 核心需求
1. 任务定义：通过继承 BaseTask 实现具体任务逻辑
2. 任务状态：PENDING, RUNNING, COMMIT, DONE, FAILED
3. 任务注册：使用装饰器 @task_register(task_type)
4. 数据持久化：PostgreSQL 表 long_tasks
5. 后台执行器：基于轮询-锁定-执行-更新的循环
6. 与 arq 集成
7. 独立进程运行
8. 支持多执行器并发

# 项目概览
- 技术栈：FastAPI + SQLAlchemy (async) + asyncpg + PostgreSQL + arq
- 现有架构：
  - /app/orm/ 包含数据库层
  - /app/memory/worker.py 有 arq 使用示例
  - 项目全异步模式
  - 已有装饰器工具在 /app/utils/decorators/

⚠️ 警告：永远不要修改此部分 ⚠️
# RIPER-5 核心协议规则
- 必须严格遵循五大模式：RESEARCH → INNOVATE → PLAN → EXECUTE → REVIEW
- EXECUTE 模式必须 100% 忠实于 PLAN 模式的规范
- 任何偏离计划的情况必须立即返回 PLAN 模式
- 代码必须完整、可运行，不使用占位符
- 保持与原始需求的清晰联系
⚠️ 警告：永远不要修改此部分 ⚠️

# 分析

## 现有代码结构分析

### 1. 数据库层 (ORM)
- **base.py**: 已配置 SQLAlchemy async engine 和 AsyncSessionLocal
- **models.py**: 使用 Mapped + mapped_column 的现代 SQLAlchemy 2.0 风格
- **crud.py**: 展示了异步 CRUD 操作模式，使用 `async with AsyncSessionLocal()` 上下文

### 2. arq 集成现状
- **worker.py**: 
  - 定义了 `WorkerSettings` 类配置 arq
  - 已有任务函数示例：`task_update_topic_memory`, `task_distill_consensus`
  - 已有定时任务示例：`cron_5m_scan_queues`, `cron_daily_consensus`
  - 使用 Redis 分布式锁模式（`redis.set(lock_key, nx=True)`）

### 3. 技术约束
- Python 3.11+
- 全异步编程模式
- SQLAlchemy 2.0 API
- arq 0.25.0

## 关键技术决策

### 1. 目录结构
选择创建 `/app/long_tasks/` 独立目录，包含：
- `__init__.py` - 导出公共 API
- `base.py` - BaseTask 抽象基类
- `registry.py` - 任务注册表和装饰器
- `models.py` - LongTask ORM 模型
- `executor.py` - 后台执行器逻辑
- `worker.py` - arq worker 配置
- `api.py` - submit_task 等外部接口
- `enums.py` - TaskStatus 枚举

### 2. 数据库表设计
表名：`long_tasks`
额外字段决策：
- `error_log` (TEXT) - 存储异常堆栈
- `created_at` (TIMESTAMP) - 任务创建时间
- `retry_count` (INTEGER, default=0) - 当前重试次数
- `max_retries` (INTEGER, default=3) - 最大重试次数
- 锁定超时：30 分钟（1800 秒）

### 3. arq 集成方案
- **方案选择**: arq 作为周期性调度引擎，数据库作为状态存储
- **执行流程**:
  1. arq cron job 每分钟触发 `poll_and_execute_tasks`
  2. 执行器从数据库中原子性锁定任务
  3. 实例化任务类并执行
  4. 更新状态并释放锁
- **优势**: 利用 arq 的分布式特性，避免重复实现调度逻辑

### 4. 并发锁定策略
使用数据库乐观锁：
```sql
UPDATE long_tasks 
SET locked_by = :executor_id, 
    lock_expiry = NOW() + INTERVAL '30 minutes',
    status = 'RUNNING'
WHERE id IN (
    SELECT id FROM long_tasks
    WHERE status IN ('PENDING', 'COMMIT')
      AND (locked_by IS NULL OR lock_expiry < NOW())
    LIMIT 1
    FOR UPDATE SKIP LOCKED
)
RETURNING *;
```

### 5. 失败重试机制
- `execute()` 抛出异常时，检查 `retry_count < max_retries`
- 若可重试：status → COMMIT, retry_count += 1
- 若不可重试：status → FAILED, 记录 error_log

# 提议的解决方案

## 技术方案选择
1. BaseTask 接口：极简接口设计
2. 任务注册：全局字典 TASK_REGISTRY
3. 执行器模式：批量并发执行（batch_size=5）
4. 数据库锁定：CTE 批量原子锁定
5. arq 集成：浅集成（定时触发器模式）
6. 失败重试：立即重试机制

## 文件结构
```
app/long_tasks/
├── __init__.py
├── enums.py
├── base.py
├── registry.py
├── models.py
├── crud.py
├── executor.py
├── api.py
└── worker.py
```

# 当前执行步骤："3. 详细规划"

# 任务进度
[2025-10-15_16:31:13]
- 已修改：无
- 更改：创建任务文件，完成代码库分析
- 原因：理解项目架构和技术栈
- 阻碍因素：无
- 状态：成功

# 最终审查
（待 REVIEW 模式填充）
