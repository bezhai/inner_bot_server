import { LarkCard, ColumnSet, ImgComponent, ButtonComponent, Column, MarkdownComponent, CardHeader } from 'feishu-card';
import { UpdatePhotoCard, FetchPhotoDetails, UpdateDailyPhotoCard } from '../../../types/lark';
import { StatusMode } from '../../../types/pixiv';
import { calcBestChunks } from '../../../utils/calc-photo';
import { getPixivImages, uploadToLark } from '../../integrations/aliyun/proxy';

export async function searchAndBuildPhotoCard(tags: string[], allow_send_limit_photo?: boolean) {
  let images = await getPixivImages({
    status: allow_send_limit_photo ? StatusMode.NOT_DELETE : StatusMode.VISIBLE,
    page: 1,
    page_size: 6,
    random_mode: true,
    tags,
  });

  if (images.length <= 0) {
    throw new Error('没有找到图片');
  }

  images = await Promise.all(
    images.map(async (image) => {
      if (!image.image_key) {
        const uploadResp = await uploadToLark({ pixiv_addr: image.pixiv_addr });
        return { ...image, ...uploadResp };
      }
      return image;
    }),
  );

  if (images.length <= 0) {
    throw new Error('图片处理失败');
  }

  const { chunks, weights } = calcBestChunks(images);

  const card = new LarkCard().addElement(
    new ColumnSet('photo_card')
      .setHorizontalSpacing('small')
      .addColumns(
        new Column('photo_column_1')
          .setWidth('weighted', weights[0])
          .addElements(
            ...chunks[0].map((image, index) =>
              new ImgComponent(`img_1_${index}`, image.image_key!).setAlt(image.pixiv_addr),
            ),
          ),
        new Column('photo_column_2')
          .setWidth('weighted', weights[1])
          .addElements(
            ...chunks[1].map((image, index) =>
              new ImgComponent(`img_2_${index}`, image.image_key!).setAlt(image.pixiv_addr),
            ),
          ),
      ),
    new ColumnSet('actions').addColumns(
      new Column('actions_column_1').addElements(
        new ButtonComponent('actions_button_1').setText('换一批').addValue({
          type: UpdatePhotoCard,
          tags,
        }),
      ),
      new Column('actions_column_2').addElements(
        new ButtonComponent('actions_button_2').setText('查看详情').addValue({
          type: FetchPhotoDetails,
          images: images.map((image) => image.pixiv_addr),
        }),
      ),
    ),
  );

  // 因为需要支持延迟更新卡片，所以需要返回 LarkCard 的 v1 版本
  return card.toV1();
}

export async function getPhotoDetailCard(pixivAddrs: string[]) {
  let images = await getPixivImages({
    status: StatusMode.ALL,
    page: 1,
    page_size: 6,
    random_mode: false,
    pixiv_addrs: pixivAddrs,
  });

  if (images.length <= 0) {
    throw new Error('没有找到图片');
  }

  const card = new LarkCard().addElement(
    ...images.map((image, index) => {
      const tags = image.multi_tags
        ?.filter((tag) => !!tag.translation && tag.visible)
        .map((tag) => tag.translation)
        .join('、');

      return new ColumnSet('photo_detail_card').addColumns(
        new Column(`column_info_${index}`)
          .addElements(
            new MarkdownComponent(
              `markdown_${index}`,
              `**图片标签**：${tags}
**作者**：${image.author}
**PixivId**：${image.pixiv_addr}`,
            ),
          )
          .setWidth('weighted', 1),
        new Column(`column_img_${index}`).addElements(
          new ImgComponent(`img_${index}`, image.image_key!)
            .setAlt(image.pixiv_addr)
            .setSize('medium')
            .setScaleType('crop_center'),
        ),
      );
    }),
  );

  return card;
}

export async function searchAndBuildDailyPhotoCard(start_time: number, allow_send_limit_photo?: boolean) {
  let images = await getPixivImages({
    status: allow_send_limit_photo ? StatusMode.NOT_DELETE : StatusMode.VISIBLE,
    page: 1,
    page_size: 6,
    random_mode: true,
    start_time,
  });

  if (images.length <= 0) {
    throw new Error('没有找到图片');
  }

  images = await Promise.all(
    images.map(async (image) => {
      if (!image.image_key) {
        const uploadResp = await uploadToLark({ pixiv_addr: image.pixiv_addr });
        return { ...image, ...uploadResp };
      }
      return image;
    }),
  );

  if (images.length <= 0) {
    throw new Error('图片处理失败');
  }

  const { chunks, weights } = calcBestChunks(images);

  const card = new LarkCard().withHeader(new CardHeader('今日新图').color('green')).addElement(
    new ColumnSet('daily_photo_card')
      .setHorizontalSpacing('small')
      .addColumns(
        new Column('card_column_1')
          .setWidth('weighted', weights[0])
          .addElements(...chunks[0].map((image) => new ImgComponent(image.image_key!, image.pixiv_addr))),
        new Column('card_column_2')
          .setWidth('weighted', weights[1])
          .addElements(...chunks[1].map((image) => new ImgComponent(image.image_key!, image.pixiv_addr))),
      ),
    new ColumnSet('actions').addColumns(
      new Column('actions_column_1').addElements(
        new ButtonComponent('actions_button_1').setText('换一批').addValue({
          type: UpdateDailyPhotoCard,
          start_time,
        }),
      ),
      new Column('actions_column_2').addElements(
        new ButtonComponent('actions_button_2').setText('查看详情').addValue({
          type: FetchPhotoDetails,
          images: images.map((image) => image.pixiv_addr),
        }),
      ),
    ),
  );

  return card;
}
