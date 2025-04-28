import { upsertAllChatInfo } from './group';

export async function botInitialization() {
    if (process.env.NEED_INIT !== 'true') {
        return;
    }

    // 初始化聊天信息
    await upsertAllChatInfo();

    // 初始化AI模型和提示词
    // await initializeAIModels();
    // await initializeAIPrompts();
}
