import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('prompt')
export class Prompt {
    @PrimaryColumn({ name: 'id', type: 'varchar' })
    id!: string; // 模板ID

    @Column({ name: 'name', type: 'varchar' })
    name!: string; // 模板名称

    @Column({ name: 'description', type: 'varchar' })
    description!: string; // 模板描述

    @Column({ name: 'content', type: 'text' })
    content!: string; // 模板内容

    @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
    createdAt!: Date; // 创建时间

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
    updatedAt!: Date; // 更新时间
}
