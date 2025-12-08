import http from '@http/client';
import { ChatMessage } from 'types/chat';
import { AxiosError } from 'axios';

const BASE_URL = `http://${process.env.AI_SERVER_HOST}:${process.env.AI_SERVER_PORT}`;

export async function storeMessage(message: ChatMessage): Promise<void> {
    try {
        await http.post(`${BASE_URL}/message`, message, {
            headers: {
                'Content-Type': 'application/json',
            },
        });
    } catch (error: unknown) {
        const axiosError = error as AxiosError;
        console.error('Failed to store message:', axiosError.response?.data || axiosError.message);
    }
}
