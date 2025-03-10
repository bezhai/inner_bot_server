import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { LarkBaseChatInfo } from './LarkBaseChatInfo';
import { AIModel } from './AIModel';

@Entity('chat_model_mapping')
export class ChatModelMapping {
  @PrimaryGeneratedColumn('uuid')
  mapping_id!: string; // 映射ID

  @Column()
  chat_id!: string; // 对话ID

  @Column()
  model_id!: string; // 模型ID

  @Column({ type: 'boolean', default: true })
  is_active!: boolean; // 映射是否激活

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at!: Date; // 创建时间

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updated_at!: Date; // 更新时间

  @ManyToOne(() => LarkBaseChatInfo)
  @JoinColumn({ name: 'chat_id' })
  chat!: LarkBaseChatInfo;

  @ManyToOne(() => AIModel)
  @JoinColumn({ name: 'model_id' })
  model!: AIModel;
}
