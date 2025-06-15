import { LarkCard } from 'feishu-card';
import { LarkCallbackInfo } from 'types/lark';
import { BaseChatInfoRepository } from 'dal/repositories/repositories';
import { sendReq } from '@lark-client';
import { searchAndBuildDailyPhotoCard } from '@media/photo/photo-card';

interface DelayUpdatedCard extends LarkCard {
    open_ids?: string[];
}

export async function handleUpdateDailyPhotoCard(data: LarkCallbackInfo, start_time: number) {
    try {
        const basicChatInfo = await BaseChatInfoRepository.findOne({
            where: { chat_id: data.context.open_chat_id },
        });

        const delayCard = (await searchAndBuildDailyPhotoCard(
            start_time,
            basicChatInfo?.permission_config?.allow_send_limit_photo,
        )) as DelayUpdatedCard;
        delayCard.open_ids = [data.operator.open_id]; // 非共享卡片需要更新卡片的open_ids

        await sendReq(
            '/open-apis/interactive/v1/card/update',
            {
                token: data.token,
                card: delayCard,
            },
            'POST',
        );
    } catch (e) {
        console.error('update daily photo card error:', {
            message: e instanceof Error ? e.message : 'Unknown error',
            stack: e instanceof Error ? e.stack : undefined,
        });
    }
}
