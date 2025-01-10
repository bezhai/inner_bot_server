import dayjs from "dayjs";
import { StatusMode } from "../../../types/pixiv";
import { getPixivImages, uploadToLark } from "../../pixivProxy/proxy";
import { calcBestChunks } from "../../../utils/calc-photo";
import {
  LarkCard,
  CardHeader,
  ColumnSet,
  ImgComponent,
  Column,
  ActionComponent,
  ButtonComponent,
} from "feishu-card";
import { replyCard, replyMessage } from "../../larkBasic/message";
import { CommonMessage } from "../../../models/common-message";

export async function sendPhoto(message: CommonMessage) {
  try {
    const tags = message
      .clearText()
      .replace(/^发/, "")
      .trim()
      .split(/\s+/)
      .filter((tag) => tag.length > 0);
    if (tags.length <= 0) {
      throw new Error("标签格式错误");
    }
    await searchAndSendPhoto(tags, message.messageId);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "未知错误";
    console.error(e);
    replyMessage(message.messageId, `发送图片失败: ${errorMessage}`, true);
  }
}

async function searchAndSendPhoto(tags: string[], messageId: string) {
  let images = await getPixivImages({
    status: StatusMode.NOT_DELETE, //TODO: 后面需要对不可见进行隔离
    page: 1,
    page_size: 6,
    random_mode: true,
    tags,
  });

  if (images.length <= 0) {
    throw new Error("没有找到图片");
  }

  images = await Promise.all(
    images.map(async (image) => {
      if (!image.image_key) {
        const uploadResp = await uploadToLark({ pixiv_addr: image.pixiv_addr });
        return { ...image, ...uploadResp };
      }
      return image;
    })
  );

  if (images.length <= 0) {
    return;
  }

  const { chunks, weights } = calcBestChunks(images);

  const card = new LarkCard()
    .addElements(
      new ColumnSet()
        .setHorizontalSpacing("small")
        .addColumn(
          new Column()
            .setWidth("weighted", weights[0])
            .addElements(
              ...chunks[0].map(
                (image) => new ImgComponent(image.image_key!, image.pixiv_addr)
              )
            )
        )
        .addColumn(
          new Column()
            .setWidth("weighted", weights[1])
            .addElements(
              ...chunks[1].map(
                (image) => new ImgComponent(image.image_key!, image.pixiv_addr)
              )
            )
        )
    )
    .addElements(
      new ActionComponent().addActions(
        new ButtonComponent().setText("换一批").addCallbackBehavior({
          type: "send-photo",
          tags,
          chat_id: messageId,
        }),
        new ButtonComponent().setText("查看详情").addCallbackBehavior({
          type: "send-photo-info",
          images: images.map((image) => image.pixiv_addr),
          chat_id: messageId,
        })
      )
    );

  await replyCard(messageId, card);
}
