import { LarkBaseChatInfo, UserChatMapping } from 'dal/entities';
import AppDataSource from 'ormconfig';
import { LarkEnterChatEvent } from 'types/lark';

export async function handlerEnterChat(data: LarkEnterChatEvent) {
    await AppDataSource.transaction(async (manager) => {
        const baseChatInfoRepository = manager.getRepository(LarkBaseChatInfo);
        const userChatMappingRepository = manager.getRepository(UserChatMapping);

        // 查询是否已经存在, 不存在则创建
        const baseChatInfo = await baseChatInfoRepository.findOne({
            where: { chat_id: data.chat_id },
        });
        if (baseChatInfo) {
            return;
        }

        // 创建基础聊天信息
        await userChatMappingRepository.save({
            chat_id: data.chat_id!,
            union_id: data.operator_id!.union_id!,
            chatInfo: {
                chat_id: data.chat_id!,
                chat_mode: 'p2p',
                // 已移除 has_main_bot 和 has_dev_bot 字段，使用多机器人配置表替代
            },
        });
    });
}
