import {
  FetchPhotoDetails,
  LarkCallbackInfo,
  UpdatePhotoCard,
} from "../../types/lark";
import { fetchAndSendPhotoDetail } from "../callback/fetch-photo-detail";
import { handleUpdatePhotoCard } from "../callback/update-photo";

export async function handleCardAction(data: LarkCallbackInfo) {
  switch (data.action.value?.type) {
    case UpdatePhotoCard:
      handleUpdatePhotoCard(data, data.action.value.tags);
      break;
    case FetchPhotoDetails:
      fetchAndSendPhotoDetail(data, data.action.value.images);
      break;
  }
}
