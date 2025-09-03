import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('model_provider')
export class ModelProvider {
    @PrimaryColumn({ name: 'provider_id', type: 'uuid' })
    providerId!: string; // 供应商ID，UUID类型

    @Column({ name: 'name', type: 'varchar', length: 100 })
    name!: string; // 供应商名称，如 "OpenAI"

    @Column({ name: 'api_key', type: 'text' })
    apiKey!: string; // API密钥

    @Column({ name: 'base_url', type: 'text' })
    baseUrl!: string; // API基础URL

    @Column({ name: 'is_active', type: 'boolean', default: true })
    isActive!: boolean; // 是否可用

    @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
    updatedAt!: Date;
}
