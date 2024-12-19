import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('lark_base_chat_info')
export class LarkBaseChatInfo {
  @PrimaryColumn()
  chat_id!: string; // 对话 ID

  @Column({ type: 'varchar', length: 10 })
  chat_mode!: 'group' | 'topic' | 'p2p'; // 对话类型

  @Column({ type: 'boolean', default: true })
  allow_send_message?: boolean; // 是否允许发送消息

  @Column({ type: 'boolean', default: true })
  allow_send_pixiv_image?: boolean; // 是否允许发送 Pixiv 图片

  @Column({ type: 'boolean', default: false })
  open_repeat_message?: boolean; // 是否开启复读

  @Column({ type: 'boolean', default: false })
  has_main_bot?: boolean; // 是否包含主机器人

  @Column({ type: 'boolean', default: false })
  has_dev_bot?: boolean; // 是否包含开发机器人
}