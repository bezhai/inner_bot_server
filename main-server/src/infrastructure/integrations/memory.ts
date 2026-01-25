import http, { requestWithRetry } from '@http/client';
import { ChatMessage } from 'types/chat';
import { AxiosError } from 'axios';

const BASE_URL = `http://${process.env.AI_SERVER_HOST}:${process.env.AI_SERVER_PORT}`;

export async function storeMessage(message: ChatMessage): Promise<void> {
    try {
        await requestWithRetry(
            () => http.post(`${BASE_URL}/message`, message, {
                headers: {
                    'Content-Type': 'application/json',
                },
            }),
            {
                maxRetries: 3,
                retryDelay: 1000,
            }
        );
    } catch (error: unknown) {
        const axiosError = error as AxiosError;
        console.error('Failed to store message after retries:', axiosError.response?.data || axiosError.message);
    }
}
