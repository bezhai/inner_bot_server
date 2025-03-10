import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('ai_model')
export class AIModel {
  @PrimaryColumn()
  model_id!: string; // 模型ID，如 "gpt-4o-mini"

  @Column({ type: 'varchar', length: 100 })
  name!: string; // 模型名称，如 "GPT-4o Mini"

  @Column({ type: 'text', nullable: true })
  description?: string; // 模型描述

  @Column({ type: 'boolean', default: false })
  is_restricted!: boolean; // 是否为受限模型

  @Column({ type: 'boolean', default: true })
  is_active!: boolean; // 模型是否可用
  
  @Column({ type: 'boolean', default: false })
  is_default!: boolean; // 是否为默认模型

  @Column({ type: 'json', nullable: true })
  default_params?: object; // 默认参数配置

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at!: Date; // 创建时间

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updated_at!: Date; // 更新时间
}
