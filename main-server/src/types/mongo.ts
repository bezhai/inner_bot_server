export type LarkMessageMetaInfo =
  | LarkUserMessageMetaInfo
  | LarkRobotMessageMetaInfo;

export interface LarkBaseMessageMetaInfo {
  message_id: string; // 消息 ID
  root_id?: string; // 根消息 ID
  parent_id?: string; // 父消息 ID
  chat_id: string; // 会话 ID
  thread_id?: string; // 话题 ID
  chat_type: string; // 会话类型
  is_delete: boolean; // 是否被撤回
  create_time: Date; // 创建时间
  update_time: Date; // 更新时间
  message_type: string; // 消息类型
}

export interface LarkUserMessageMetaInfo extends LarkBaseMessageMetaInfo {
  sender?: string; // 发送者 ID, 如果是机器人则没有该字段
  is_from_robot: false; // 是否是机器人发送的消息
  message_content?: string; // 消息内容
  mentions: LarkSimpleMention[]; // 提及的用户 ID 列表, 这里是 open_id
}

export interface LarkRobotMessageMetaInfo extends LarkBaseMessageMetaInfo {
  is_from_robot: true; // 是否是机器人发送的消息
  robot_text?: string; // 机器人回复的内容
  card_id?: string; // 机器人回复的卡片 ID
}

export interface LarkSimpleMention {
  key: string;
  id: {
    union_id?: string;
    user_id?: string;
    open_id?: string;
  };
  name: string;
}

// 包含群聊和私聊的元信息
export type LarkChatInfo = LarkGroupChatInfo | LarkSelfChatInfo;

interface LarkBaseChatInfo {
  chat_id: string; // 对话 ID
  chat_mode: 'group' | 'topic' | 'p2p'; // 对话类型
  allow_send_message?: boolean; // 是否允许发送消息, 如果未取值则默认按其他字段去判断权限
  allow_send_pixiv_image?: boolean; // 是否允许发送pixiv图片
  open_repeat_message?: boolean; // 是否开启复读
  has_main_bot?: boolean; // 群聊中是否包含主机器人, 如果是私聊则指向是否为主机器人的对话
  has_dev_bot?: boolean; // 群聊中是否包含开发机器人, 如果是私聊则指向是否为开发机器人的对话
}

export interface LarkGroupChatInfo extends LarkBaseChatInfo {
  chat_mode: 'group' | 'topic'; // 对话类型
  name: string; // 群聊名称
  avatar: string; // 群聊头像
  description: string; // 群聊描述
  user_manager_id_list: string[]; // 群聊管理员 ID 列表
  chat_tag: string; // 群标签, 可以用来判断是否是部门群这种
  group_message_type?: "chat" | "thread"; // 群聊消息类型
  chat_status: "normal" | "dissolved" | "dissolved_save"; // 群聊状态
  download_has_permission_setting?: "all_members" | "not_anyone"; // 群聊下载权限设置
  user_count: number; // 群聊人数
}

export interface LarkSelfChatInfo extends LarkBaseChatInfo {
  chat_mode: 'p2p'; // 对话类型
}

export interface LarkGroupMember {
  chat_id: string; // 群聊 ID
  union_id: string; // 用户 ID
  is_owner: boolean; // 是否是群主
  is_manager: boolean; // 是否是管理员
}

export interface LarkUser {
  union_id: string; // 用户唯一标识
  user_id: string; // 用户 ID
  name: string; // 用户名称
  avatar_origin?: string; // 用户头像
  is_admin?: boolean; // 是否是超级管理员
}