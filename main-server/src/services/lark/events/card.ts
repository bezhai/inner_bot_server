import {
    LarkCallbackInfo,
    UpdatePhotoCard,
    FetchPhotoDetails,
    UpdateDailyPhotoCard,
    LarkCardRetry,
    LarkCardThumbsDown,
    LarkCardThumbsUp,
} from 'types/lark';
import { fetchAndSendPhotoDetail } from '@callback/fetch-photo-detail';
import { handleUpdatePhotoCard, handleUpdateDailyPhotoCard } from '@callback/update-card';
import { handleRetryCard } from '@callback/retry-card';
import { handleFeedback } from '@callback/feedback';

export async function handleCardAction(data: LarkCallbackInfo) {
    switch (data.action.value?.type) {
        case UpdatePhotoCard:
            handleUpdatePhotoCard(data, data.action.value.tags);
            break;
        case FetchPhotoDetails:
            fetchAndSendPhotoDetail(data, data.action.value.images);
            break;
        case UpdateDailyPhotoCard:
            handleUpdateDailyPhotoCard(data, data.action.value.start_time);
            break;
        case LarkCardRetry:
            handleRetryCard(data.action.value);
            break;
        case LarkCardThumbsDown:
            handleFeedback(data.action.value, data.operator.union_id);
            break;
        case LarkCardThumbsUp:
            handleFeedback(data.action.value, data.operator.union_id);
            break;
        default:
            console.warn('unknown card action', data);
    }
}
