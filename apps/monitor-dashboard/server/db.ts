import 'reflect-metadata';
import './load-env';
import { DataSource } from 'typeorm';
import {
  Column,
  Entity,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('conversation_messages')
export class ConversationMessage {
  @PrimaryColumn({ type: "varchar", length: 100 })
  message_id!: string;

  @Column({ type: "varchar", length: 100 })
  user_id!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: "varchar", length: 20 })
  role!: string;

  @Column({ type: "varchar", length: 100 })
  root_message_id!: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  reply_message_id?: string;

  @Column({ type: "varchar", length: 100 })
  chat_id!: string;

  @Column({ type: "varchar", length: 10 })
  chat_type!: string;

  @Column({ type: 'bigint' })
  create_time!: string;

  @Column({ type: "varchar", length: 20, default: "pending" })
  vector_status!: string;

  @Column({ type: "varchar", length: 50, nullable: true })
  bot_name?: string;

  @Column({ type: "varchar", length: 30, nullable: true, default: "text" })
  message_type?: string;
}

@Entity('model_provider')
export class ModelProvider {
  @PrimaryColumn({ type: 'uuid' })
  provider_id!: string;

  @Column({ type: "varchar", length: 100 })
  name!: string;

  @Column({ type: 'text' })
  api_key!: string;

  @Column({ type: 'text' })
  base_url!: string;

  @Column({ type: "varchar", length: 50, default: "openai" })
  client_type!: string;

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @CreateDateColumn({ type: 'timestamp' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at!: Date;
}

@Entity('model_mappings')
export class ModelMapping {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: "varchar", length: 100 })
  alias!: string;

  @Column({ type: "varchar", length: 100 })
  provider_name!: string;

  @Column({ type: "varchar", length: 100 })
  real_model_name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  model_config?: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at!: Date;
}

@Entity('lark_user')
export class LarkUser {
  @PrimaryColumn({ type: 'varchar' })
  union_id!: string;

  @Column({ type: 'varchar' })
  name!: string;
}

@Entity('lark_group_chat_info')
export class LarkGroupChatInfo {
  @PrimaryColumn({ type: 'varchar' })
  chat_id!: string;

  @Column({ type: 'varchar' })
  name!: string;
}

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  port: 5432,
  username: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || '',
  database: process.env.POSTGRES_DB || 'postgres',
  synchronize: false,
  logging: ['error'],
  entities: [ConversationMessage, ModelProvider, ModelMapping, LarkUser, LarkGroupChatInfo],
});
