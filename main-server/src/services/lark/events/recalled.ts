import { LarkRecalledMessage } from 'types/lark';
import { recallMessage } from 'services/message-store/basic';

export async function handleMessageRecalled(params: LarkRecalledMessage) {
    if (params.message_id) {
        await recallMessage(params.message_id);
    }
}
