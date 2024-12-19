import * as lark from "@larksuiteoapi/node-sdk";

const client = new lark.Client({
  appId:
    process.env.IS_DEV === "true"
      ? process.env.DEV_BOT_APP_ID!
      : process.env.MAIN_BOT_APP_ID!,
  appSecret:
    process.env.IS_DEV === "true"
      ? process.env.DEV_BOT_APP_SECRET!
      : process.env.MAIN_BOT_APP_SECRET!,
});

interface LarkResp<T> {
  code: number;
  msg: string;
  data: T;
}

// 发送消息
export async function send(chat_id: string, content: any, msgType: string) {
  return await client.im.message
    .create({
      params: {
        receive_id_type: "chat_id",
      },
      data: {
        receive_id: chat_id,
        content: JSON.stringify(content),
        msg_type: msgType,
      },
    })
    .then((res) => {
      if (res.code !== 0) {
        throw new Error(res.msg);
      }
      return res.data;
    })
    .catch((e) => {
      console.error(JSON.stringify(e.response.data, null, 4));
    });
}

// 回复消息
export async function reply(messageId: string, content: any, msgType: string) {
  return await client.im.message
    .reply({
      path: {
        message_id: messageId,
      },
      data: {
        content: JSON.stringify(content),
        msg_type: msgType,
      },
    })
    .then((res) => {
      if (res.code !== 0) {
        throw new Error(res.msg);
      }
      return res.data;
    })
    .catch((e) => {
      console.error(JSON.stringify(e.response.data, null, 4));
    });
}

// 发送请求, 主要用于sdk不支持的接口
export async function sendReq<T>(url: string, data: any, method: string) {
  return await client
    .request<LarkResp<T>>({
      url,
      method,
      data,
    })
    .then((res) => {
      if (res.code !== 0) {
        console.error(JSON.stringify(res, null, 4));
        throw new Error(res.msg);
      }
      return res.data;
    })
    .catch((e) => {
      console.error(JSON.stringify(e.response.data, null, 4));
      throw e;
    });
}

// 获取群聊列表
export async function getChatList(page_token?: string) {
  return await client.im.chat
    .list({
      params: {
        page_size: 100,
        page_token,
        sort_type: "ByCreateTimeAsc",
      },
    })
    .then((res) => {
      if (res.code !== 0) {
        console.error(JSON.stringify(res, null, 4));
        throw new Error(res.msg);
      }
      return res.data;
    })
    .catch((e) => {
      console.error(JSON.stringify(e.response.data, null, 4));
      throw e;
    });
}

// 查看群聊信息
export async function getChatInfo(chat_id: string) {
  return await client.im.chat
    .get({
      path: {
        chat_id,
      },
      params: {
        user_id_type: "union_id",
      },
    })
    .then((res) => {
      if (res.code !== 0) {
        console.error(JSON.stringify(res, null, 4));
        throw new Error(res.msg);
      }
      return res.data;
    })
    .catch((e) => {
      console.error(JSON.stringify(e.response.data, null, 4));
      throw e;
    });
}
