import axios, { AxiosResponse } from 'axios';
import { BaseResponse } from '../../../types/pixiv';
import { CommonMessage } from '../../../models/common-message';

export async function checkMeme(message: CommonMessage): Promise<boolean> {
  try {
    const response: AxiosResponse<BaseResponse<void>> = await axios.post(`${process.env.MEME_HOST}/api/check`, {
      text: message.clearText(),
      image_num: message.imageKeys().length,
    });

    return response.data.code === 0;
  } catch (error: any) {
    console.error('Error in req:', error);
    return false;
  }
}

export async function genMeme(message: CommonMessage) {
  try {
    await axios.post(`${process.env.MEME_HOST}/api/gen`, {
      text: message.clearText(),
      image_keys: message.imageKeys(),
      message_id: message.messageId,
      chat_id: message.chatId,
    });
  } catch (error: any) {
    console.error('Error in req:', error);
  }
}
