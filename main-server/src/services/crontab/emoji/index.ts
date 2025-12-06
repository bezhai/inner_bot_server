import * as cron from 'node-cron';
import { emojiService } from './service';

export class EmojiScheduler {
    private syncJob: cron.ScheduledTask | null = null;

    /**
     * 启动定时任务，每小时执行一次emoji数据同步
     */
    start(): void {
        console.info('Starting emoji scheduler...');

        // 每小时执行一次，时间格式：分钟 小时 日 月 周
        // 0 * * * * 表示每小时的第0分钟执行
        this.syncJob = cron.schedule('0 * * * *', async () => {
            try {
                console.info('Running scheduled emoji sync...');
                await emojiService.syncEmojiData();
                console.info('Scheduled emoji sync completed successfully');
            } catch (error) {
                console.error('Scheduled emoji sync failed:', error);
            }
        });

        this.syncJob.start();
        console.info('Emoji scheduler started - will sync every hour');
    }

    /**
     * 立即执行一次同步
     */
    async runSyncNow(): Promise<void> {
        try {
            console.info('Running immediate emoji sync...');
            await emojiService.syncEmojiData();
            console.info('Immediate emoji sync completed successfully');
        } catch (error) {
            console.error('Immediate emoji sync failed:', error);
            throw error;
        }
    }

    /**
     * 停止定时任务
     */
    stop(): void {
        if (this.syncJob) {
            this.syncJob.stop();
            console.info('Emoji scheduler stopped');
        }
    }

    /**
     * 获取定时任务状态
     */
    getStatus(): { isRunning: boolean } {
        return {
            isRunning: this.syncJob !== null
        };
    }
}

export const emojiScheduler = new EmojiScheduler();
