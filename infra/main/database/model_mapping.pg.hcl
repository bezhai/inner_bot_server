table "model_mappings" {
  schema = schema.public
  column "id" {
    null = false
    type = uuid
  }
  column "alias" {
    null = false
    type = character_varying(100)
  }
  column "provider_name" {
    null = false
    type = character_varying(100)
  }
  column "real_model_name" {
    null = false
    type = character_varying(100)
  }
  column "description" {
    null = true
    type = text
  }
  column "model_config" {
    null = true
    type = jsonb
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
  primary_key "PK_model_mappings_id" {
    columns = [column.id]
  }
  index "idx_model_mappings_alias" {
    columns = [column.alias]
    unique  = true
  }
}
