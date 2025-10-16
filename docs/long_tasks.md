# 长期任务框架使用文档

## 概述

本框架提供了一个基于 PostgreSQL + arq 的长期、多步骤任务执行系统，支持：

- ✅ 任务注册与类型管理
- ✅ 异步任务提交
- ✅ 后台并发执行
- ✅ 状态持久化
- ✅ 自动失败重试
- ✅ 多执行器实例并发（分布式锁）

## 核心概念

### 1. 任务状态

| 状态 | 描述 |
|------|------|
| `PENDING` | 任务已提交，等待首次执行 |
| `RUNNING` | 任务正在被执行器处理（短暂状态） |
| `COMMIT` | 任务的一个步骤已完成，等待执行下一步 |
| `DONE` | 任务所有步骤执行完毕 |
| `FAILED` | 任务执行失败且不可重试 |

### 2. 任务生命周期

```
PENDING → RUNNING → COMMIT → RUNNING → ... → DONE
                ↓
              FAILED (重试次数耗尽)
```

## 快速开始

### 1. 定义任务

```python
from app.long_tasks import BaseTask, TaskStatus, task_register

@task_register("my_task_type")
class MyTask(BaseTask):
    async def execute(self):
        # 从 self.result 获取上次执行的结果
        step = self.result.get("step", 0)
        
        if step == 0:
            # 第一步逻辑
            return {"step": 1, "data": "..."}, TaskStatus.COMMIT
        
        elif step == 1:
            # 第二步逻辑
            return {"step": 2, "final": True}, TaskStatus.DONE
        
        else:
            raise ValueError("Invalid step")
```

### 2. 提交任务

```python
from app.long_tasks import submit_task

# 提交任务
task_id = await submit_task(
    task_type="my_task_type",
    initial_result={"start_value": 100},
    max_retries=3
)

print(f"任务已提交，ID: {task_id}")
```

### 3. 查询任务状态

```python
from app.long_tasks import get_task_status

status = await get_task_status(task_id)
print(f"状态: {status['status']}")
print(f"当前结果: {status['current_result']}")
print(f"错误日志: {status['error_log']}")
```

### 4. 启动后台执行器

```bash
# 启动 arq worker
arq app.long_tasks.worker.LongTaskWorkerSettings
```

执行器会每分钟自动轮询并执行待处理的任务。

## 数据库迁移

在使用框架前，需要先应用数据库 schema：

```bash
# 使用 Atlas 或其他迁移工具应用 schema/long_tasks.pg.hcl
atlas schema apply --url "postgresql://..." --to "file://schema/long_tasks.pg.hcl"
```

或者手动创建表（SQL）：

```sql
CREATE TABLE long_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_type VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL,
    current_result JSONB NOT NULL DEFAULT '{}'::jsonb,
    initial_params JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    locked_by VARCHAR(255),
    lock_expiry TIMESTAMPTZ,
    error_log TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3
);

CREATE INDEX idx_long_tasks_status_lock ON long_tasks(status, locked_by, lock_expiry);
CREATE INDEX idx_long_tasks_type ON long_tasks(task_type);
```

## 高级用法

### 自定义重试次数

```python
task_id = await submit_task(
    task_type="my_task_type",
    initial_result={"data": "..."},
    max_retries=5  # 自定义最大重试次数
)
```

### 异常处理

任务的 `execute()` 方法抛出异常时，框架会自动：

1. 捕获异常堆栈
2. 将堆栈写入 `error_log` 字段
3. 检查 `retry_count < max_retries`
4. 如果可重试，将状态设为 `COMMIT`，增加计数器
5. 如果不可重试，将状态设为 `FAILED`

```python
@task_register("risky_task")
class RiskyTask(BaseTask):
    async def execute(self):
        if some_condition_fails:
            # 抛出异常会触发重试机制
            raise RuntimeError("操作失败，需要重试")
        
        return {"result": "success"}, TaskStatus.DONE
```

### 多执行器并发

框架支持多个执行器实例同时运行，使用数据库乐观锁避免冲突：

```bash
# 机器 A
arq app.long_tasks.worker.LongTaskWorkerSettings

# 机器 B
arq app.long_tasks.worker.LongTaskWorkerSettings

# 机器 C
arq app.long_tasks.worker.LongTaskWorkerSettings
```

每个执行器会生成唯一标识 `hostname:pid`，确保任务不会被重复执行。

### 调整执行器配置

修改 `app/long_tasks/worker.py`：

```python
async def task_executor_job(ctx) -> None:
    await poll_and_execute_tasks(
        batch_size=10,        # 单次锁定 10 个任务
        lock_timeout_seconds=3600  # 锁定超时 1 小时
    )
```

或通过环境变量（在 `config.py` 中添加）：

```python
# .env
LONG_TASK_BATCH_SIZE=10
LONG_TASK_LOCK_TIMEOUT=3600
```

## 完整示例

参考 `examples/long_task_example.py`：

```python
"""
多步骤计算任务示例
"""
import asyncio
from app.long_tasks import BaseTask, TaskStatus, submit_task, get_task_status, task_register

@task_register("multi_step_calculation")
class MultiStepCalculation(BaseTask):
    async def execute(self):
        step = self.result.get("step", 0)
        
        if step == 0:
            value = self.result.get("start", 0)
            new_value = value ** 2
            return {"step": 1, "value": new_value}, TaskStatus.COMMIT
        
        elif step == 1:
            value = self.result["value"]
            final_value = value * 2
            return {"step": 2, "value": final_value}, TaskStatus.DONE
        
        else:
            raise ValueError("Invalid step")

async def main():
    task_id = await submit_task(
        task_type="multi_step_calculation",
        initial_result={"start": 10}
    )
    print(f"Task submitted: {task_id}")
    
    while True:
        status = await get_task_status(task_id)
        print(f"Status: {status['status']}, Result: {status['current_result']}")
        
        if status["status"] in [TaskStatus.DONE, TaskStatus.FAILED]:
            break
        
        await asyncio.sleep(5)

if __name__ == "__main__":
    asyncio.run(main())
```

## 架构设计

### 核心组件

```
┌─────────────────┐
│  User Code      │  提交任务
└────────┬────────┘
         ↓
┌─────────────────┐
│  API Layer      │  submit_task(), get_task_status()
└────────┬────────┘
         ↓
┌─────────────────┐
│  CRUD Layer     │  create_task(), lock_tasks(), update_task_*()
└────────┬────────┘
         ↓
┌─────────────────┐
│  PostgreSQL DB  │  long_tasks 表
└─────────────────┘
         ↑
         │
┌─────────────────┐
│  arq Worker     │  每分钟触发 poll_and_execute_tasks()
└────────┬────────┘
         ↓
┌─────────────────┐
│  Executor       │  锁定任务 → 执行 → 更新状态
└────────┬────────┘
         ↓
┌─────────────────┐
│  Task Registry  │  get_task_class() → 实例化 → execute()
└─────────────────┘
```

### 并发锁定机制

使用 PostgreSQL 的 `FOR UPDATE SKIP LOCKED` 实现无阻塞锁定：

```sql
WITH selected AS (
    SELECT id FROM long_tasks
    WHERE status IN ('PENDING', 'COMMIT')
      AND (locked_by IS NULL OR lock_expiry < NOW())
    LIMIT 5
    FOR UPDATE SKIP LOCKED
)
UPDATE long_tasks
SET locked_by = 'executor-1', lock_expiry = NOW() + INTERVAL '30 minutes'
FROM selected
WHERE long_tasks.id = selected.id
RETURNING *;
```

## 常见问题

### Q1: 任务卡在 RUNNING 状态怎么办？

执行器崩溃可能导致任务被锁定但无法释放。框架通过 `lock_expiry` 字段自动处理：

- 当 `lock_expiry < NOW()` 时，任务会被其他执行器重新锁定
- 默认超时时间为 30 分钟

### Q2: 如何监控任务执行情况？

查询数据库：

```sql
-- 统计各状态任务数量
SELECT status, COUNT(*) FROM long_tasks GROUP BY status;

-- 查看失败任务
SELECT id, task_type, error_log FROM long_tasks WHERE status = 'FAILED';

-- 查看长时间运行的任务
SELECT id, task_type, locked_by, lock_expiry 
FROM long_tasks 
WHERE status = 'RUNNING' AND lock_expiry > NOW();
```

### Q3: 任务执行频率如何调整？

修改 `worker.py` 中的 cron 配置：

```python
cron_jobs = [
    cron(task_executor_job, minute="*/5"),  # 每 5 分钟执行一次
    # 或
    cron(task_executor_job, second="*/30"),  # 每 30 秒执行一次
]
```

## 最佳实践

1. **幂等性设计**：任务的 `execute()` 方法应该是幂等的，即多次执行相同输入得到相同结果。
2. **合理分步**：将长时间任务拆分为多个短步骤，每步返回 `COMMIT` 状态。
3. **错误处理**：在任务内部捕获预期异常，仅在不可恢复时抛出。
4. **日志记录**：在任务内部添加日志，便于调试。
5. **资源管理**：确保任务不会持有过长的数据库连接或文件句柄。

## API 参考

### submit_task()

```python
async def submit_task(
    task_type: str,
    initial_result: Dict,
    max_retries: int = 3
) -> UUID
```

**参数**：
- `task_type`: 任务类型标识符（必须已通过 `@task_register` 注册）
- `initial_result`: 初始参数字典
- `max_retries`: 最大重试次数（默认 3）

**返回**：任务 UUID

**异常**：
- `KeyError`: 任务类型未注册

### get_task_status()

```python
async def get_task_status(task_id: UUID) -> Optional[Dict]
```

**参数**：
- `task_id`: 任务 UUID

**返回**：任务信息字典，包含：
- `id`: UUID
- `task_type`: str
- `status`: str
- `current_result`: Dict
- `initial_params`: Dict
- `created_at`: datetime
- `updated_at`: datetime
- `error_log`: Optional[str]
- `retry_count`: int
- `max_retries`: int

如果任务不存在返回 `None`。

### @task_register()

```python
@task_register(task_type: str)
class MyTask(BaseTask):
    ...
```

**参数**：
- `task_type`: 唯一的任务类型标识符

**异常**：
- `TypeError`: 被装饰类未继承 `BaseTask`
- `ValueError`: 任务类型已被注册

### BaseTask.execute()

```python
async def execute(self) -> Tuple[Dict, str]
```

**必须实现**的抽象方法。

**返回**：
- `Dict`: 新的结果字典（将保存到 `current_result`）
- `str`: 新的任务状态（`TaskStatus.COMMIT`, `TaskStatus.DONE`, 或 `TaskStatus.FAILED`）

**异常**：任何异常都会触发重试机制。

## 维护与扩展

### 添加新的任务类型

1. 创建任务类并注册：

```python
from app.long_tasks import BaseTask, TaskStatus, task_register

@task_register("new_task_type")
class NewTask(BaseTask):
    async def execute(self):
        # 实现逻辑
        return {"result": "..."}, TaskStatus.DONE
```

2. 确保在 worker 启动前导入任务类（例如在 `worker.py` 中导入）

### 扩展任务基类

如果需要添加生命周期钩子，可以创建中间基类：

```python
from app.long_tasks import BaseTask

class ExtendedBaseTask(BaseTask):
    async def validate(self):
        """执行前校验"""
        pass
    
    async def execute(self):
        await self.validate()
        result = await self.do_work()
        return result
    
    async def do_work(self):
        """子类实现具体逻辑"""
        raise NotImplementedError
```

## 故障排查

### 任务未被执行

1. 检查 arq worker 是否运行：`ps aux | grep arq`
2. 检查数据库连接配置
3. 检查任务状态：`SELECT * FROM long_tasks WHERE id = 'task_id';`
4. 查看 worker 日志

### 任务重复执行

1. 检查是否有多个执行器实例
2. 确认锁定机制是否正常：`SELECT locked_by, lock_expiry FROM long_tasks;`
3. 检查数据库时钟同步

### 性能问题

1. 调整 `batch_size` 参数
2. 优化数据库索引
3. 增加执行器实例数量
4. 检查任务逻辑是否有阻塞操作

## 许可与贡献

本框架是 ai-service 项目的一部分，遵循项目整体许可协议。

