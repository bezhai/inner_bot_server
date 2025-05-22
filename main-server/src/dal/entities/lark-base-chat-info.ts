import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('lark_base_chat_info')
export class LarkBaseChatInfo {
    @PrimaryColumn()
    chat_id!: string; // 对话 ID

    @Column({ type: 'varchar', length: 10 })
    chat_mode!: 'group' | 'topic' | 'p2p'; // 对话类型

    @Column({ type: 'jsonb', nullable: true })
    permission_config?: {
        allow_send_message?: boolean;
        allow_send_pixiv_image?: boolean;
        open_repeat_message?: boolean;
        allow_send_limit_photo?: boolean;
        can_access_restricted_models?: boolean;
        can_access_restricted_prompts?: boolean;
        new_permission?: boolean;
    }; // 权限配置，包含所有权限相关设置

    @Column({ type: 'boolean', nullable: true })
    has_main_bot?: boolean; // 是否包含主机器人

    @Column({ type: 'boolean', nullable: true })
    has_dev_bot?: boolean; // 是否包含开发机器人
}
