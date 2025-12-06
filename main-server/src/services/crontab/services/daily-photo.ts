import { StatusMode } from 'types/pixiv';
import dayjs from 'dayjs';
import {
    ButtonComponent,
    CardHeader,
    Column,
    ColumnSet,
    ImgComponent,
    LarkCard,
} from 'feishu-card';
import { fetchUploadedImages } from '@media/photo/upload';
import { sendCard } from '@lark-basic/message';
import { calcBestChunks } from '@media/photo/calc-photo';
import { FetchPhotoDetails, UpdateDailyPhotoCard } from 'types/lark';
import { Crontab, registerCrontabService } from '../decorators';

export class DailyPhotoService {
    /**
     * 发图给订阅群聊
     * 每天 18:00 执行
     */
    @Crontab('29 18 * * *', { taskName: 'daily-photo', botName: 'bytedance' })
    async sendDailyPhoto(): Promise<void> {
        let images = await fetchUploadedImages({
            status: StatusMode.VISIBLE,
            page: 1,
            page_size: 1,
            random_mode: true,
        });

        if (images.length <= 0) {
            return;
        }

        const card = new LarkCard()
            .withHeader(new CardHeader('今天的每日一图').color('blue'))
            .addElement(new ImgComponent(images[0].image_key!).setAlt(images[0].pixiv_addr));

        sendCard('oc_0d2e26c81fdf0823997a7bb40d71dcc1', card);
    }

    /**
     * 发新图给特定群聊
     * 每天 19:30 执行
     */
    @Crontab('33 10 * * *', { taskName: 'daily-new-photo', botName: 'bytedance' })
    async dailySendNewPhoto(): Promise<void> {
        let images = await fetchUploadedImages({
            status: StatusMode.NOT_DELETE,
            page: 1,
            page_size: 6,
            random_mode: true,
            start_time: dayjs().add(-1, 'day').valueOf(),
        });

        if (images.length <= 0) {
            return;
        }

        const { chunks, weights } = calcBestChunks(images);

        const card = new LarkCard()
            .withHeader(new CardHeader('今日新图').color('green'))
            .addElement(
                new ColumnSet()
                    .setHorizontalSpacing('small')
                    .addColumns(
                        new Column()
                            .setWidth('weighted', weights[0])
                            .addElements(
                                ...chunks[0].map((image) =>
                                    new ImgComponent(image.image_key!).setAlt(image.pixiv_addr),
                                ),
                            ),
                        new Column()
                            .setWidth('weighted', weights[1])
                            .addElements(
                                ...chunks[1].map((image) =>
                                    new ImgComponent(image.image_key!).setAlt(image.pixiv_addr),
                                ),
                            ),
                    ),
                new ColumnSet().addColumns(
                    new Column().addElements(
                        new ButtonComponent().setText('换一批').addValue({
                            type: UpdateDailyPhotoCard,
                            start_time: dayjs().add(-1, 'day').valueOf(),
                        }),
                    ),
                    new Column().addElements(
                        new ButtonComponent().setText('查看详情').addValue({
                            type: FetchPhotoDetails,
                            images: images.map((image) => image.pixiv_addr),
                        }),
                    ),
                ),
            );

        sendCard('oc_a79ce7cc8cc4afdcfd519532d0a917f5', card);
    }
}

// 导出单例
export const dailyPhotoService = new DailyPhotoService();

// 注册定时任务
registerCrontabService(dailyPhotoService);

