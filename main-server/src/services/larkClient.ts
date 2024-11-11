import * as Lark from "@larksuiteoapi/node-sdk";
import { LarkCard } from "feishu-card";

const baseConfig = {
  appId: process.env.APP_ID!,
  appSecret: process.env.APP_SECRET!,
};

const client = new Lark.Client(baseConfig);

export async function sendMsg(chat_id: string, message: string) {
  client.im.message
    .create({
      params: {
        receive_id_type: "chat_id",
      },
      data: {
        receive_id: chat_id,
        content: JSON.stringify({ text: message }),
        msg_type: "text",
      },
    })
    .catch((e) => {
      console.error(JSON.stringify(e.response.data, null, 4));
    });
}

export async function sendCard(chat_id: string, card: LarkCard) {
  client.im.message
    .create({
      params: {
        receive_id_type: "chat_id",
      },
      data: {
        receive_id: chat_id,
        content: JSON.stringify(card),
        msg_type: "interactive",
      },
    })
    .catch((e) => {
      console.error(JSON.stringify(e.response.data, null, 4));
    });
}
