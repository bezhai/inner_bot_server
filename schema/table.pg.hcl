table "bot_config" {
  schema = schema.public
  column "bot_name" {
    null = false
    type = character_varying(50)
  }
  column "app_id" {
    null = false
    type = character_varying(100)
  }
  column "app_secret" {
    null = false
    type = character_varying(200)
  }
  column "encrypt_key" {
    null = false
    type = character_varying(100)
  }
  column "verification_token" {
    null = false
    type = character_varying(100)
  }
  column "robot_union_id" {
    null = false
    type = character_varying(100)
  }
  column "init_type" {
    null    = false
    type    = character_varying(20)
    default = "http"
  }
  column "is_active" {
    null    = false
    type    = boolean
    default = true
  }
  column "is_dev" {
    null    = false
    type    = boolean
    default = false
  }
  column "description" {
    null = true
    type = text
  }
  column "created_at" {
    null    = false
    type    = timestamp
    default = sql("now()")
  }
  column "updated_at" {
    null    = false
    type    = timestamp
    default = sql("now()")
  }
  primary_key "PK_8a20b9abe585c8e8b6d9d24cbf2" {
    columns = [column.bot_name]
  }
}
table "lark_base_chat_info" {
  schema = schema.public
  column "chat_id" {
    null = false
    type = character_varying
  }
  column "chat_mode" {
    null = false
    type = character_varying(10)
  }
  column "permission_config" {
    null = true
    type = jsonb
  }
  column "gray_config" {
    null = true
    type = jsonb
  }
  primary_key "PK_1bbfde6e303414e212f345a4a0e" {
    columns = [column.chat_id]
  }
}
table "lark_card_context" {
  schema = schema.public
  column "card_id" {
    null = false
    type = character_varying
  }
  column "message_id" {
    null = false
    type = character_varying
  }
  column "chat_id" {
    null = false
    type = character_varying
  }
  column "sequence" {
    null = false
    type = integer
  }
  column "created_at" {
    null = false
    type = timestamp
  }
  column "last_updated" {
    null = false
    type = timestamp
  }
  primary_key "PK_5b20a5507efccdee2838edee32c" {
    columns = [column.card_id]
  }
}
table "lark_group_chat_info" {
  schema = schema.public
  column "chat_id" {
    null = false
    type = character_varying
  }
  column "name" {
    null = false
    type = character_varying
  }
  column "avatar" {
    null = true
    type = text
  }
  column "description" {
    null = true
    type = text
  }
  column "user_manager_id_list" {
    null = true
    type = sql("text[]")
  }
  column "chat_tag" {
    null = true
    type = character_varying(255)
  }
  column "group_message_type" {
    null = true
    type = character_varying(10)
  }
  column "chat_status" {
    null = false
    type = character_varying(20)
  }
  column "download_has_permission_setting" {
    null = true
    type = character_varying(20)
  }
  column "user_count" {
    null = false
    type = integer
  }
  column "is_leave" {
    null    = false
    type    = boolean
    default = false
  }
  primary_key "PK_34fccd78604d9b83e6d0aee0711" {
    columns = [column.chat_id]
  }
  foreign_key "FK_34fccd78604d9b83e6d0aee0711" {
    columns     = [column.chat_id]
    ref_columns = [table.lark_base_chat_info.column.chat_id]
    on_update   = NO_ACTION
    on_delete   = NO_ACTION
  }
}
table "lark_group_member" {
  schema = schema.public
  column "chat_id" {
    null = false
    type = character_varying
  }
  column "union_id" {
    null = false
    type = character_varying
  }
  column "is_owner" {
    null    = false
    type    = boolean
    default = false
  }
  column "is_manager" {
    null    = false
    type    = boolean
    default = false
  }
  column "is_leave" {
    null    = false
    type    = boolean
    default = false
  }
  column "created_at" {
    null    = false
    type    = timestamp
    default = sql("now()")
  }
  column "updated_at" {
    null    = false
    type    = timestamp
    default = sql("now()")
  }
  primary_key "PK_5b7ac116dc153f41440eba50d6b" {
    columns = [column.chat_id, column.union_id]
  }
}
table "lark_user" {
  schema = schema.public
  column "union_id" {
    null = false
    type = character_varying
  }
  column "name" {
    null = false
    type = character_varying
  }
  column "avatar_origin" {
    null = true
    type = text
  }
  column "is_admin" {
    null = true
    type = boolean
  }
  primary_key "PK_c1dde9a74cf1672eccb9d7f0ac8" {
    columns = [column.union_id]
  }
}
table "lark_user_open_id" {
  schema = schema.public
  column "app_id" {
    null = false
    type = character_varying
  }
  column "open_id" {
    null = false
    type = character_varying
  }
  column "union_id" {
    null = true
    type = character_varying
  }
  column "name" {
    null = false
    type = character_varying
  }
  primary_key "PK_0ce3e0c85d20a5ab81c62cb0c06" {
    columns = [column.app_id, column.open_id]
  }
}
table "model_provider" {
  schema = schema.public
  column "provider_id" {
    null = false
    type = uuid
  }
  column "name" {
    null = false
    type = character_varying(100)
  }
  column "api_key" {
    null = false
    type = text
  }
  column "base_url" {
    null = false
    type = text
  }
  column "client_type" {
    null    = false
    type    = character_varying(50)
    default = "openai"
  }
  column "is_active" {
    null    = false
    type    = boolean
    default = true
  }
  column "created_at" {
    null    = false
    type    = timestamp
    default = sql("now()")
  }
  column "updated_at" {
    null    = false
    type    = timestamp
    default = sql("now()")
  }
  primary_key "PK_60a910b81dfddc72d75f81de0a7" {
    columns = [column.provider_id]
  }
}
table "response_feedback" {
  schema = schema.public
  column "id" {
    null = false
    type = integer
  }
  column "message_id" {
    null = false
    type = character_varying
  }
  column "chat_id" {
    null = false
    type = character_varying
  }
  column "parent_message_id" {
    null = false
    type = character_varying
  }
  column "feedback_type" {
    null = false
    type = character_varying
  }
  column "created_at" {
    null    = false
    type    = timestamp
    default = sql("now()")
  }
  primary_key "PK_1b8e3b99afad48f1574fdd8585b" {
    columns = [column.id]
  }
}
table "user_group_binding" {
  schema = schema.public
  column "id" {
    null = false
    type = serial
  }
  column "user_union_id" {
    null = false
    type = character_varying
  }
  column "chat_id" {
    null = false
    type = character_varying
  }
  column "is_active" {
    null    = false
    type    = boolean
    default = true
  }
  column "created_at" {
    null    = false
    type    = timestamp
    default = sql("now()")
  }
  column "updated_at" {
    null    = false
    type    = timestamp
    default = sql("now()")
  }
  unique "UQ_user_group_binding_user_chat" {
    columns = [column.user_union_id, column.chat_id]
  }
}
table "conversation_messages" {
  schema = schema.public
  column "message_id" {
    null = false
    type = character_varying(100)
  }
  column "user_id" {
    null = false
    type = character_varying(100)
  }
  column "content" {
    null = false
    type = text
  }
  column "role" {
    null = false
    type = character_varying(20)
  }
  column "root_message_id" {
    null = false
    type = character_varying(100)
  }
  column "reply_message_id" {
    null = true
    type = character_varying(100)
  }
  column "chat_id" {
    null = false
    type = character_varying(100)
  }
  column "chat_type" {
    null = false
    type = character_varying(10)
  }
  column "create_time" {
    null = false
    type = bigint
  }
  column "created_at" {
    null    = false
    type    = timestamp
    default = sql("now()")
  }
  primary_key "PK_conversation_messages" {
    columns = [column.message_id]
  }
  index "idx_conversation_messages_user_id" {
    columns = [column.user_id]
  }
  index "idx_conversation_messages_chat_id" {
    columns = [column.chat_id]
  }
  index "idx_conversation_messages_root_message_id" {
    columns = [column.root_message_id]
  }
  index "idx_conversation_messages_create_time" {
    columns = [column.create_time]
  }
}
table "topic_memory" {
  schema = schema.public
  column "id" {
    null = false
    type = serial
  }
  column "group_id" {
    null = false
    type = character_varying(100)
  }
  column "title" {
    null = false
    type = character_varying(255)
  }
  column "summary" {
    null = false
    type = text
  }
  column "created_at" {
    null    = false
    type    = timestamp
    default = sql("now()")
  }
  column "updated_at" {
    null    = false
    type    = timestamp
    default = sql("now()")
  }
  primary_key "PK_topic_memory" {
    columns = [column.id]
  }
  index "idx_topic_memory_group_updated" {
    columns = [column.group_id, column.updated_at]
  }
}
table "lark_emoji" {
  schema = schema.public
  column "key" {
    null = false
    type = character_varying(100)
  }
  column "text" {
    null = false
    type = character_varying(500)
  }
  column "created_at" {
    null    = false
    type    = timestamp
    default = sql("now()")
  }
  column "updated_at" {
    null    = false
    type    = timestamp
    default = sql("now()")
  }
  primary_key "PK_lark_emoji" {
    columns = [column.key]
  }
}

table "user_profiles" {
  schema = schema.public
  column "user_id" {
    null = false
    type = character_varying(100)
  }
  column "profile" {
    null = true
    type = text
  }
  column "created_at" {
    null    = false
    type    = timestamp
    default = sql("now()")
  }
  column "updated_at" {
    null    = false
    type    = timestamp
    default = sql("now()")
  }
  primary_key "PK_user_profiles" {
    columns = [column.user_id]
  }
}

table "group_profiles" {
  schema = schema.public
  column "chat_id" {
    null = false
    type = character_varying(100)
  }
  column "profile" {
    null = true
    type = text
  }
  column "created_at" {
    null    = false
    type    = timestamp
    default = sql("now()")
  }
  column "updated_at" {
    null    = false
    type    = timestamp
    default = sql("now()")
  }
  primary_key "PK_group_profiles" {
    columns = [column.chat_id]
  }
}
