import { PostNode } from "./post-node-types";

// 文本消息内容
export interface TextContent {
  text: string; // 文本内容，必填
}

// 图片消息内容
export interface ImageContent {
  image_key: string; // 图片的 key，必填
}

// 表情包消息内容
export interface StickerContent {
  file_key: string; // 表情包文件的 key，必填
}

// 富文本消息内容
export interface PostContent {
  title?: string; // 富文本消息的标题
  content: PostNode[][]; // 富文本消息的内容，二维数组
}

export type Content = TextContent | ImageContent | StickerContent | PostContent;
