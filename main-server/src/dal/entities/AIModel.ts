import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { ModelProvider } from './ModelProvider';

@Entity('ai_model')
export class AIModel {
  @PrimaryColumn()
  model_id!: string; // 模型ID，如 "gpt-4o-mini"

  @Column({ type: 'varchar', nullable: true })
  model_name?: string; // 模型名称，用于实际调用

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

  @Column({ type: 'boolean', default: false })
  is_multimodal!: boolean; // 是否为多模态模型

  @Column({ type: 'boolean', default: false })
  is_thinking!: boolean; // 是否为思维链

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at!: Date; // 创建时间

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updated_at!: Date; // 更新时间

  // 关联到模型供应商
  @ManyToOne(() => ModelProvider, (provider) => provider.models)
  @JoinColumn({ name: 'provider_id' })
  provider!: ModelProvider;

  @Column({ nullable: true })
  provider_id!: string; // 供应商ID外键
}
