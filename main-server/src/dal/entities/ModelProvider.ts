import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { AIModel } from './AIModel';

@Entity('model_provider')
export class ModelProvider {
    @PrimaryGeneratedColumn('uuid')
    provider_id!: string; // 供应商ID

    @Column({ type: 'varchar', length: 100 })
    name!: string; // 供应商名称，如 "OpenAI", "Anthropic", "Google" 等

    @Column({ type: 'text' })
    api_key!: string; // API密钥

    @Column({ type: 'text' })
    base_url!: string; // API基础URL

    @Column({ type: 'boolean', default: true })
    is_active!: boolean; // 供应商是否可用

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at!: Date; // 创建时间

    @Column({
        type: 'timestamp',
        default: () => 'CURRENT_TIMESTAMP',
        onUpdate: 'CURRENT_TIMESTAMP',
    })
    updated_at!: Date; // 更新时间

    @OneToMany(() => AIModel, (model) => model.provider)
    models!: AIModel[];
}
