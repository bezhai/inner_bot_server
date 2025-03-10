import { Entity, PrimaryGeneratedColumn, Column, JoinColumn, OneToOne } from 'typeorm';
import { LarkBaseChatInfo } from './LarkBaseChatInfo';

@Entity('user_chat_mapping')
export class UserChatMapping {
  @PrimaryGeneratedColumn('uuid')
  mapping_id!: string; // 映射ID

  @Column()
  chat_id!: string; // 对话ID

  @Column()
  union_id!: string; // 用户ID

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at!: Date; // 创建时间

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updated_at!: Date; // 更新时间

  @OneToOne(() => LarkBaseChatInfo, { cascade: true })
  @JoinColumn({ name: 'chat_id' })
  chatInfo!: LarkBaseChatInfo;
}
