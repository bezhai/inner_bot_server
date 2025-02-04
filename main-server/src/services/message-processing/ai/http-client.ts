import { CompletionRequest } from '../../../types/ai';
import axios from 'axios';

const BASE_URL = `http://${process.env.AI_SERVER_HOST}:${process.env.AI_SERVER_PORT}`;

const axiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30000, // 30秒超时
  headers: {
    'Content-Type': 'application/json',
  },
});

export async function fetchChatCompletion(payload: CompletionRequest): Promise<Response> {
  try {
    const response = await axiosInstance.post('/chat', payload, {
      responseType: 'stream',
      timeout: 300000, // 5分钟超时
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      } as any,
    });

    // 转换axios响应为fetch Response格式
    const headers = new Headers({
      'content-type': 'text/event-stream',
      'transfer-encoding': 'chunked',
      ...(response.headers as any),
    });

    return new Response(response.data, {
      status: response.status,
      headers,
    });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`Chat completion request failed with status code: ${error.response?.status}`);
    }
    throw error;
  }
}

export async function fetchAvailableModels(): Promise<string[]> {
  try {
    const response = await axiosInstance.get('/model/list');
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`Model list request failed with status code: ${error.response?.status}`);
    }
    throw error;
  }
}
