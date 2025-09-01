import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ModelProvider } from './model-provider';

@Entity('ai_model')
export class AiModel {
    @PrimaryColumn({ name: 'model_id', type: 'varchar' })
    modelId!: string; // 模型ID，如 "gpt-4o-mini"

    @Column({ name: 'model_name', type: 'varchar', nullable: true })
    modelName?: string; // 实际调用名

    @Column({ name: 'name', type: 'varchar', length: 100 })
    name!: string; // 展示名

    @Column({ name: 'description', type: 'text', nullable: true })
    description?: string; // 描述

    @Column({ name: 'is_restricted', type: 'boolean', default: false })
    isRestricted!: boolean; // 是否受限

    @Column({ name: 'is_active', type: 'boolean', default: true })
    isActive!: boolean; // 是否可用

    @Column({ name: 'is_default', type: 'boolean', default: false })
    isDefault!: boolean; // 是否默认

    @Column({ name: 'default_params', type: 'json', nullable: true })
    defaultParams?: Record<string, any>; // 默认参数

    @Column({ name: 'is_multimodal', type: 'boolean', default: false })
    isMultimodal!: boolean; // 是否多模态

    @Column({ name: 'is_thinking', type: 'boolean', default: false })
    isThinking!: boolean; // 是否思维链

    @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
    updatedAt!: Date;

    @Column({ name: 'provider_id', type: 'uuid' })
    providerId!: string; // 供应商外键

    @ManyToOne(() => ModelProvider)
    @JoinColumn({ name: 'provider_id' })
    provider!: ModelProvider; // 供应商关联
}