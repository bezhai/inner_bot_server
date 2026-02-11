table "agent_responses" {
  schema = schema.public

  column "id" {
    type    = uuid
    default = sql("gen_random_uuid()")
  }

  column "session_id" {
    type = varchar(100)
    null = false
  }

  column "trigger_message_id" {
    type = varchar(100)
    null = false
  }

  column "chat_id" {
    type = varchar(100)
    null = false
  }

  column "bot_name" {
    type = varchar(50)
    null = true
  }

  column "response_type" {
    type    = varchar(30)
    default = "reply"
  }

  column "replies" {
    type    = jsonb
    default = sql("'[]'::jsonb")
  }

  column "response_text" {
    type = text
    null = true
  }

  column "agent_metadata" {
    type    = jsonb
    default = sql("'{}'::jsonb")
  }

  column "safety_status" {
    type    = varchar(20)
    default = "pending"
  }

  column "safety_result" {
    type = jsonb
    null = true
  }

  column "status" {
    type    = varchar(20)
    default = "created"
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

  primary_key {
    columns = [column.id]
  }

  index "idx_agent_responses_session" {
    columns = [column.session_id]
    unique  = true
  }

  index "idx_agent_responses_trigger" {
    columns = [column.trigger_message_id]
  }

  index "idx_agent_responses_chat" {
    columns = [column.chat_id]
  }

  index "idx_agent_responses_created" {
    columns = [column.created_at]
  }

  index "idx_agent_responses_safety_pending" {
    columns = [column.safety_status]
    where   = "(safety_status = 'pending')"
  }
}
