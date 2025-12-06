import { context } from '../../middleware/context';

/**
 * 带任务名称的装饰器工厂：自动添加任务日志
 * 会在任务开始和结束时记录日志，并捕获错误
 *
 * @param taskName 任务名称
 * @param botName 机器人名称
 * @returns 方法装饰器
 *
 * @example
 * class DailyPhotoScheduler {
 *   @CrontabTask('daily-photo', 'bytedance')
 *   async sendDailyPhoto() {
 *     await sendCard(chatId, card);
 *   }
 * }
 */
export function CrontabTask(taskName: string, botName: string = 'bytedance') {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor): PropertyDescriptor {
        const originalMethod = descriptor.value;

        descriptor.value = async function (...args: any[]) {
            console.info(`[${taskName}] Starting scheduled task...`);

            // 创建包含 botName 和 traceId 的上下文
            const contextData = context.createContext(botName);

            try {
                // 在 AsyncLocalStorage 上下文中执行处理函数
                const result = await context.run(contextData, async () => {
                    return await originalMethod.apply(this, args);
                });

                console.info(`[${taskName}] Task completed successfully`);
                return result;
            } catch (error) {
                console.error(`[${taskName}] Task failed:`, error);
                throw error;
            }
        };

        return descriptor;
    };
}
