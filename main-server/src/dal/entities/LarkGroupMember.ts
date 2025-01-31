import { Entity, PrimaryColumn, Column } from "typeorm";

@Entity("lark_group_member")
export class LarkGroupMember {
  @PrimaryColumn()
  chat_id!: string; // 群聊 ID

  @PrimaryColumn()
  union_id!: string; // 用户 ID

  @Column({ type: "boolean", default: false })
  is_owner?: boolean; // 是否是群主

  @Column({ type: "boolean", default: false })
  is_manager?: boolean; // 是否是管理员

  @Column({ type: "boolean", default: false })
  is_leave?: boolean; // 是否是离开群聊
}
