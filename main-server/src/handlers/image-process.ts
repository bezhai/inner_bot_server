import Router from '@koa/router';
import { Context } from 'koa';
import { downloadResource } from '../services/integrations/lark-client';
import { uploadImages } from '../services/integrations/image-host';
import { bearerAuthMiddleware } from '../middleware/auth';
import { traceMiddleware } from '../middleware/trace';
import { botContextMiddleware } from '../middleware/bot-context';

const router = new Router({ prefix: '/api/image' });

// 应用中间件
router.use(traceMiddleware);
router.use(botContextMiddleware);
router.use(bearerAuthMiddleware);

// 图片下载并上传API
router.post('/process', async (ctx: Context) => {
    const { message_id, file_key } = ctx.request.body as {
        message_id: string;
        file_key: string;
    };

    if (!message_id || !file_key) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'message_id and file_key are required' };
        return;
    }

    try {
        // 下载图片
        const downloadResponse = await downloadResource(message_id, file_key, 'image');
        const imageStream = downloadResponse.getReadableStream();
        
        // 上传图片
        const uploadResult = await uploadImages(imageStream);
        
        ctx.body = {
            success: true,
            data: { url: uploadResult.links.url },
            message: 'Image processed successfully',
        };
    } catch (error) {
        ctx.status = 500;
        ctx.body = {
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error',
        };
    }
});

export default router;