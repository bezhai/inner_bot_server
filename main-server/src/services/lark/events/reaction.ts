import { getReactionCollection } from 'dal/mongo/client';
import { LarkOperateReactionInfo } from 'types/lark';

export async function handleReaction(params: LarkOperateReactionInfo) {
    await getReactionCollection().insertOne(params);
}
