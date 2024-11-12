import * as Lark from "@larksuiteoapi/node-sdk";
import { LarkCard } from "feishu-card";
import { PostContent } from "../types/receiveMessage";
import { SendContent } from "../types/sendMessage";

const baseConfig = {
  appId: process.env.APP_ID!,
  appSecret: process.env.APP_SECRET!,
};

const client = new Lark.Client(baseConfig);

export async function send(
  chat_id: string,
  content: SendContent,
  msgType: string
) {
  await client.im.message
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
    .catch((e) => {
      console.error(JSON.stringify(e.response.data, null, 4));
    });
}

export async function sendMsg(chat_id: string, message: string) {
  await send(chat_id, { text: message }, "text");
}

export async function sendPost(chat_id: string, content: PostContent) {
  await send(chat_id, {zh_cn: content}, "post");
}

export async function sendCard(chat_id: string, card: LarkCard) {
  await send(chat_id, card, "interactive");
}
