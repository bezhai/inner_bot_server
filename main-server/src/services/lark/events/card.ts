import {
  LarkCallbackInfo,
  UpdatePhotoCard,
  FetchPhotoDetails,
  UpdateDailyPhotoCard,
  SetLLMConfig,
  SetLLMConfigFormValue,
} from '../../../types/lark';
import { fetchAndSendPhotoDetail } from '../../callback/fetch-photo-detail';
import { handleSetLLMConfig } from '../../callback/set-llm-config';
import { handleUpdateDailyPhotoCard } from '../../callback/update-daily-photo';
import { handleUpdatePhotoCard } from '../../callback/update-photo';

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
    case SetLLMConfig:
      handleSetLLMConfig(data, data.action.form_value as SetLLMConfigFormValue);
      break;
    default:
      console.log('unknown card action', data);
  }
}
