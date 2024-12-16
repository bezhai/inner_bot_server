// 发送者相关信息
export interface LarkSender {
  sender_id?: {
    union_id?: string;
    user_id?: string;
    open_id?: string;
  };
  sender_type: string;
  tenant_key?: string;
}

// 提及用户的结构
export interface LarkMention {
  key: string;
  id: {
    union_id?: string;
    user_id?: string;
    open_id?: string;
  };
  name: string;
  tenant_key?: string;
}

// 消息的结构
export interface LarkMessage {
  message_id: string;
  root_id?: string;
  parent_id?: string;
  create_time: string;
  update_time?: string;
  chat_id: string;
  thread_id?: string;
  chat_type: string;
  message_type: string;
  content: string;
  mentions?: LarkMention[];
  user_agent?: string;
}

// Lark 消息接收事件的整体定义
export interface LarkReceiveMessage {
  event_id?: string;
  token?: string;
  create_time?: string;
  event_type?: string;
  tenant_key?: string;
  ts?: string;
  uuid?: string;
  type?: string;
  app_id?: string;
  sender: LarkSender;
  message: LarkMessage;
}

export interface LarkRecalledMessage {
  event_id?: string;
  token?: string;
  create_time?: string;
  event_type?: string;
  tenant_key?: string;
  ts?: string;
  uuid?: string;
  type?: string;
  app_id?: string;
  message_id?: string;
  chat_id?: string;
  recall_time?: string;
  recall_type?: "message_owner" | "group_owner" | "group_manager" | "enterprise_manager";
}
