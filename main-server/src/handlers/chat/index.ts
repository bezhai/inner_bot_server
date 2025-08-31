/**
 * @file index.ts
 * @description 聊天相关路由
 */

import Router from '@koa/router';
import { handleChatSse } from './sse';

const router = new Router();

// SSE聊天接口
router.post('/chat/sse', handleChatSse);

export { router as chatRouter };