import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('ai_prompt')
export class AIPrompt {
  @PrimaryGeneratedColumn('uuid')
  prompt_id!: string; // 提示词ID

  @Column({ type: 'varchar', length: 100 })
  name!: string; // 提示词名称

  @Column({ type: 'text' })
  content!: string; // 提示词内容

  @Column({ type: 'text', nullable: true })
  description?: string; // 提示词描述

  @Column({ type: 'boolean', default: false })
  is_restricted!: boolean; // 是否为受限提示词

  @Column({ type: 'boolean', default: true })
  is_active!: boolean; // 提示词是否可用
  
  @Column({ type: 'boolean', default: false })
  is_default!: boolean; // 是否为默认提示词

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at!: Date; // 创建时间

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updated_at!: Date; // 更新时间
}
