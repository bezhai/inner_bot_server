import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { LarkBaseChatInfo } from './lark-base-chat-info';
import { AIPrompt } from './ai-prompt';

@Entity('chat_prompt_mapping')
@Index(['chat_id'], { unique: true })
export class ChatPromptMapping {
    @PrimaryGeneratedColumn('uuid')
    mapping_id!: string; // 映射ID

    @Column()
    chat_id!: string; // 对话ID

    @Column()
    prompt_id!: string; // 提示词ID

    @Column({ type: 'boolean', default: true })
    is_active!: boolean; // 映射是否激活

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at!: Date; // 创建时间

    @Column({
        type: 'timestamp',
        default: () => 'CURRENT_TIMESTAMP',
        onUpdate: 'CURRENT_TIMESTAMP',
    })
    updated_at!: Date; // 更新时间

    @ManyToOne(() => LarkBaseChatInfo)
    @JoinColumn({ name: 'chat_id' })
    chat!: LarkBaseChatInfo;

    @ManyToOne(() => AIPrompt)
    @JoinColumn({ name: 'prompt_id' })
    prompt!: AIPrompt;
}
