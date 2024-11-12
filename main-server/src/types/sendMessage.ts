import { Card } from "feishu-card";
import { PostContent, TextContent, ImageContent, StickerContent } from "./receiveMessage";

export interface SendPostContent {
  zh_cn: PostContent; // 中文
}

export type SendContent = TextContent | ImageContent | StickerContent | SendPostContent | Card;
