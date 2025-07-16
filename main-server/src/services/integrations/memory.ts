import http from "utils/http";
import { ChatMessage } from "types/chat";
import { AxiosError } from "axios";

const BASE_URL = `${process.env.MEMORY_BASE_URL}/api/v1/memory`;

export async function storeMessage(message: ChatMessage): Promise<void> {
    console.log('storeMessage', JSON.stringify(message));
    try {
        await http.post(`${BASE_URL}/message`, message, {
            headers: {
                'Content-Type': 'application/json',
            },
        });
    } catch (error: unknown) {
        const axiosError = error as AxiosError;
        console.error(
            'Failed to store message:',
            axiosError.response?.data || axiosError.message,
        );
    }
}