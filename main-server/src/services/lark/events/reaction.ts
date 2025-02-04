import { ReactionCollection } from '../../../dal/mongo/client';
import { LarkOperateReactionInfo } from '../../../types/lark';

export async function handleReaction(params: LarkOperateReactionInfo) {
  await ReactionCollection.insertOne(params);
}
