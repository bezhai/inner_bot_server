import * as lark from "@larksuiteoapi/node-sdk";
import { getBotAppId, getBotAppSecret } from "../utils/botVar";

const client = new lark.Client({
  appId: getBotAppId(),
  appSecret: getBotAppSecret(),
});

interface LarkResp<T> {
  code?: number;
  msg?: string;
  data?: T;
}

async function handleResponse<T>(promise: Promise<LarkResp<T>>): Promise<T> {
  try {
    const res = await promise;
    if (res.code !== 0) {
      throw new Error(res.msg);
    }
    return res.data!;
  } catch (e: any) {
    console.error(JSON.stringify(e.response?.data || e, null, 4));
    throw e;
  }
}

export async function send(chat_id: string, content: any, msgType: string) {
  return handleResponse(
    client.im.message.create({
      params: { receive_id_type: "chat_id" },
      data: {
        receive_id: chat_id,
        content: JSON.stringify(content),
        msg_type: msgType,
      },
    })
  );
}

export async function reply(messageId: string, content: any, msgType: string) {
  return handleResponse(
    client.im.message.reply({
      path: { message_id: messageId },
      data: { content: JSON.stringify(content), msg_type: msgType },
    })
  );
}

export async function sendReq<T>(url: string, data: any, method: string) {
  return handleResponse(
    client.request<LarkResp<T>>({
      url,
      method,
      data,
    })
  );
}

export async function getChatList(page_token?: string) {
  return handleResponse(
    client.im.chat.list({
      params: { page_size: 100, page_token, sort_type: "ByCreateTimeAsc" },
    })
  );
}

export async function getChatInfo(chat_id: string) {
  return handleResponse(
    client.im.chat.get({
      path: { chat_id },
      params: { user_id_type: "union_id" },
    })
  );
}

export async function searchAllMembers(chat_id: string, page_token?: string) {
  return handleResponse(
    client.im.chatMembers.get({
      path: { chat_id },
      params: { page_size: 50, page_token, member_id_type: "union_id" },
    })
  );
}

export async function getMessageInfo(message_id: string) {
  return handleResponse(
    client.im.message.get({
      path: { message_id },
      params: { user_id_type: "union_id" },
    })
  );
}

export async function deleteMessage(message_id: string) {
  return handleResponse(
    client.im.message.delete({
      path: { message_id },
    })
  )
}