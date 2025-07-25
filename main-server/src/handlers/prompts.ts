import Router from '@koa/router';
import { listPrompts, upsertPrompt } from '../services/prompts/prompt';
import { Prompt } from '../dal/entities';

const router = new Router({ prefix: '/api/prompts' });

// 获取所有提示词模板
router.get('/', async (ctx) => {
    try {
        const prompts = await listPrompts();
        ctx.body = {
            success: true,
            data: prompts,
            message: 'Prompts retrieved successfully'
        };
        ctx.status = 200;
    } catch (error) {
        ctx.body = {
            success: false,
            message: error instanceof Error ? error.message : 'Failed to retrieve prompts'
        };
        ctx.status = 500;
    }
});

// 创建或更新提示词模板
router.post('/', async (ctx) => {
    try {
        const promptData: Prompt = ctx.request.body;
        
        if (!promptData.id || !promptData.name || !promptData.content) {
            ctx.body = {
                success: false,
                message: 'Missing required fields: id, name, or content'
            };
            ctx.status = 400;
            return;
        }

        const prompt = await upsertPrompt(promptData);
        ctx.body = {
            success: true,
            data: prompt,
            message: 'Prompt saved successfully'
        };
        ctx.status = 200;
    } catch (error) {
        ctx.body = {
            success: false,
            message: error instanceof Error ? error.message : 'Failed to save prompt'
        };
        ctx.status = 500;
    }
});

// 删除提示词模板
// 在没搞定鉴权之前先不删除
// router.delete('/:id', async (ctx) => {
//     try {
//         const { id } = ctx.params;
//         // 这里需要添加删除逻辑，目前PromptRepository没有删除方法
//         // 可以后续扩展
//         ctx.body = {
//             success: false,
//             message: 'Delete operation not implemented yet'
//         };
//         ctx.status = 501;
//     } catch (error) {
//         ctx.body = {
//             success: false,
//             message: error instanceof Error ? error.message : 'Failed to delete prompt'
//         };
//         ctx.status = 500;
//     }
// });

export default router;