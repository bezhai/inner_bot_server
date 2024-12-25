import { LarkCard } from "feishu-card";
import { PostContent } from "../../types/receiveMessage";
import { reply, send } from "../../dal/larkClient";

export async function sendMsg(chat_id: string, message: string) {
  await send(chat_id, { text: message }, "text");
}

export async function sendSticker(chat_id: string, sticker_id: string) {
  await send(chat_id, { file_key: sticker_id }, "sticker");
}

export async function replyMessage(messageId: string, message: string) {
  await reply(messageId, { text: message }, "text");
}

export async function sendPost(chat_id: string, content: PostContent) {
  await send(chat_id, { zh_cn: content }, "post");
}

export async function sendCard(chat_id: string, card: LarkCard) {
  await send(chat_id, card, "interactive");
}

export async function replyTemplate(messageId: string, template_id: string, template_variable: any) {
  await reply(messageId, {type: "template", data: {template_id, template_variable}}, "interactive");
}