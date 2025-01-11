import {
  LarkCard,
  ColumnSet,
  ImgComponent,
  ActionComponent,
  ButtonComponent,
  Column,
  MarkdownComponent,
} from "feishu-card";
import { UpdatePhotoCard, FetchPhotoDetails } from "../../types/lark";
import { StatusMode } from "../../types/pixiv";
import { calcBestChunks } from "../../utils/calc-photo";
import { getPixivImages, uploadToLark } from "../aliyun/proxy";

export async function searchAndBuildPhotoCard(
  tags: string[],
  allow_send_limit_photo?: boolean
) {
  let images = await getPixivImages({
    status: allow_send_limit_photo ? StatusMode.NOT_DELETE : StatusMode.VISIBLE,
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
    throw new Error("图片处理失败");
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
        new ButtonComponent().setText("换一批").addValue({
          type: UpdatePhotoCard,
          tags,
        }),
        new ButtonComponent().setText("查看详情").addValue({
          type: FetchPhotoDetails,
          images: images.map((image) => image.pixiv_addr),
        })
      )
    );

  return card;
}

export async function getPhotoDetailCard(pixivAddrs: string[]) {
  let images = await getPixivImages({
    status: StatusMode.ALL,
    page: 1,
    page_size: 6,
    random_mode: true,
    pixiv_addrs: pixivAddrs,
  });

  if (images.length <= 0) {
    throw new Error("没有找到图片");
  }

  const card = new LarkCard().addElements(
    ...images.map((image) => {
      const tags = image.multi_tags
        ?.filter((tag) => !!tag.translation && tag.visible)
        .map((tag) => tag.translation)
        .join("、");

      return new ColumnSet()
        .addColumn(
          new Column()
            .addElements(
              new MarkdownComponent(`**图片标签**：${tags}
**作者**：${image.author}
**PixivId**：${image.pixiv_addr}`)
            )
            .setWidth("weighted", 1)
        )
        .addColumn(
          new Column().addElements(
            new ImgComponent(image.image_key!, image.pixiv_addr)
              .setSize("medium")
              .setScaleType("crop_center")
          )
        );
    })
  );

  return card;
}
