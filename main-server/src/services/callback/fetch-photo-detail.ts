import { sendReq } from '../../dal/lark-client';
import { BaseChatInfoRepository, UserRepository } from '../../dal/repositories/repositories';
import { LarkCallbackInfo } from '../../types/lark';
import { replyCard } from '../lark/basic/message';
import { getPhotoDetailCard } from '../media/photo/photo-card';

export async function fetchAndSendPhotoDetail(data: LarkCallbackInfo, pixivAddrs: string[]) {
  try {
    const basicChatInfoPromise = BaseChatInfoRepository.findOne({
      where: { chat_id: data.context.open_chat_id },
    });

    const detailCardPromise = getPhotoDetailCard(pixivAddrs);

    const userInfoPromise = UserRepository.findOne({
      where: { union_id: data.operator.union_id },
    });

    const [basicChatInfo, detailCard, userInfo] = await Promise.all([
      basicChatInfoPromise,
      detailCardPromise,
      userInfoPromise,
    ]);

    if (basicChatInfo?.chat_mode === 'p2p' || !basicChatInfo) {
      await replyCard(data.context.open_message_id, detailCard);
    } else {
      // 群聊下需要发送到指定用户
      await sendReq(
        `/open-apis/ephemeral/v1/send`,
        {
          chat_id: data.context.open_chat_id,
          msg_type: 'interactive',
          card: detailCard,
          open_id: data.operator.open_id,
        },
        'POST',
      );
    }
  } catch (e) {
    console.error(e);
  }
}
