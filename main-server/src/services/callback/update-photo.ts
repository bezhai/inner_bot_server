import { LarkCallbackInfo } from '../../types/lark';
import { BaseChatInfoRepository } from '../../dal/repositories/repositories';
import { sendReq } from '../../dal/lark-client';
import { searchAndBuildPhotoCard } from '../media/photo/photo-card';

export async function handleUpdatePhotoCard(data: LarkCallbackInfo, tags: string[]) {
    try {
        const basicChatInfo = await BaseChatInfoRepository.findOne({
            where: { chat_id: data.context.open_chat_id },
        });

        const updatedCard = await searchAndBuildPhotoCard(
            tags,
            basicChatInfo?.allow_send_limit_photo,
        );

        const delayCard = {
            open_ids: [data.operator.open_id], // 非共享卡片需要更新卡片的open_ids
            elements: updatedCard.getElements(),
        };

        await sendReq(
            '/open-apis/interactive/v1/card/update',
            {
                token: data.token,
                card: delayCard,
            },
            'POST',
        );
    } catch (e) {
        console.error(e);
    }
}
