import * as lark from "@larksuiteoapi/node-sdk";

const client = new lark.Client({
  appId: process.env.APP_ID!,
  appSecret: process.env.APP_SECRET!,
});

interface LarkResp<T> {
  code: number;
  msg: string;
  data: T;
}

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

export async function sendReq<T>(url: string, data: any, method: string) {
  return await client
    .request<LarkResp<T>>({
      url,
      method,
      data,
    })
    .then((res) => {
      if (res.code!== 0) {
        console.error(JSON.stringify(res, null, 4));
        throw new Error(res.msg);
      }
      return res.data;
    }).catch((e) => {
      console.error(JSON.stringify(e.response.data, null, 4));
      throw e;
    });
}
