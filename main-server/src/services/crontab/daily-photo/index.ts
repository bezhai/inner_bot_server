import * as cron from 'node-cron';
import { dailyPhotoService } from './service';

export class DailyPhotoScheduler {
    private newPhotoJob: cron.ScheduledTask | null = null;
    private dailyPhotoJob: cron.ScheduledTask | null = null;

    /**
     * 启动定时任务
     */
    start(): void {
        console.info('Starting daily photo scheduler...');

        // 使用装饰器方式，直接调用服务方法
        this.newPhotoJob = cron.schedule('30 19 * * *', () =>
            dailyPhotoService.dailySendNewPhoto(),
        );

        this.dailyPhotoJob = cron.schedule('0 18 * * *', () =>
            dailyPhotoService.sendDailyPhoto(),
        );

        this.newPhotoJob.start();
        this.dailyPhotoJob.start();
        console.info('Daily photo scheduler started');
    }
}

export const dailyPhotoScheduler = new DailyPhotoScheduler();
