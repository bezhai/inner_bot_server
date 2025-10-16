table "long_tasks" {
  schema = schema.public

  column "id" {
    type    = uuid
    default = sql("gen_random_uuid()")
  }

  column "task_type" {
    type = varchar(100)
    null = false
  }

  column "status" {
    type = varchar(20)
    null = false
  }

  column "current_result" {
    type    = jsonb
    null    = false
    default = sql("'{}'::jsonb")
  }

  column "initial_params" {
    type    = jsonb
    null    = false
    default = sql("'{}'::jsonb")
  }

  column "created_at" {
    type    = timestamptz
    null    = false
    default = sql("now()")
  }

  column "updated_at" {
    type    = timestamptz
    null    = false
    default = sql("now()")
  }

  column "locked_by" {
    type = varchar(255)
    null = true
  }

  column "lock_expiry" {
    type = timestamptz
    null = true
  }

  column "error_log" {
    type = text
    null = true
  }

  column "retry_count" {
    type    = integer
    null    = false
    default = 0
  }

  column "max_retries" {
    type    = integer
    null    = false
    default = 3
  }

  primary_key {
    columns = [column.id]
  }

  index "idx_long_tasks_status_lock" {
    columns = [column.status, column.locked_by, column.lock_expiry]
  }

  index "idx_long_tasks_type" {
    columns = [column.task_type]
  }
}

