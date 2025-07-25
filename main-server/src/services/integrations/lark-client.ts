import * as lark from '@larksuiteoapi/node-sdk';
import { getBotAppId, getBotAppSecret } from 'utils/bot/bot-var';
import { Readable } from 'node:stream';
import { ReadStream } from 'node:fs';

const errorMap: Record<number, string> = {
    41050: '无用户权限，请将当前操作的用户添加到应用或用户的权限范围内',
};

const client = new lark.Client({
    appId: getBotAppId(),
    appSecret: getBotAppSecret(),
});

interface LarkResp<T> {
    code?: number;
    msg?: string;
    data?: T;
}

async function handleResponse<T>(promise: Promise<LarkResp<T>>): Promise<T> {
    try {
        const res = await promise;
        if (res.code !== 0) {
            throw new Error(res.msg);
        }
        return res.data!;
    } catch (e: any) {
        console.error(JSON.stringify(e.response?.data || e, null, 4));
        if (e.response?.data?.code) {
            throw new Error(errorMap[e.response?.data?.code] || e.response?.data?.msg);
        }
        throw e;
    }
}

export async function getUserInfo(unionId: string) {
    return handleResponse(
        client.contact.v3.user.get({
            path: { user_id: unionId },
            params: { user_id_type: 'union_id' },
        }),
    );
}

export async function send(chat_id: string, content: any, msgType: string) {
    return handleResponse(
        client.im.message.create({
            params: { receive_id_type: 'chat_id' },
            data: {
                receive_id: chat_id,
                content: JSON.stringify(content),
                msg_type: msgType,
            },
        }),
    );
}

export async function reply(
    messageId: string,
    content: any,
    msgType: string,
    replyInThread?: boolean,
) {
    return handleResponse(
        client.im.message.reply({
            path: { message_id: messageId },
            data: {
                content: JSON.stringify(content),
                msg_type: msgType,
                reply_in_thread: replyInThread,
            },
        }),
    );
}

export async function sendReq<T>(url: string, data: any, method: string) {
    return handleResponse(
        client.request<LarkResp<T>>({
            url,
            method,
            data,
        }),
    );
}

export async function getChatList(page_token?: string) {
    return handleResponse(
        client.im.chat.list({
            params: { page_size: 100, page_token, sort_type: 'ByCreateTimeAsc' },
        }),
    );
}

export async function getChatInfo(chat_id: string) {
    return handleResponse(
        client.im.chat.get({
            path: { chat_id },
            params: { user_id_type: 'union_id' },
        }),
    );
}

export async function searchAllMembers(
    chat_id: string,
    page_token?: string,
    member_id_type: 'user_id' | 'union_id' | 'open_id' = 'union_id',
) {
    return handleResponse(
        client.im.chatMembers.get({
            path: { chat_id },
            params: { page_size: 50, page_token, member_id_type },
        }),
    );
}

export async function getMessageInfo(message_id: string) {
    return handleResponse(
        client.im.message.get({
            path: { message_id },
            params: { user_id_type: 'union_id' },
        }),
    );
}

export async function deleteMessage(message_id: string) {
    return handleResponse(
        client.im.message.delete({
            path: { message_id },
        }),
    );
}

export async function getMessageList(
    chatId: string,
    startTime?: number,
    endTime?: number,
    pageToken?: string,
) {
    return handleResponse(
        client.im.message.list({
            params: {
                page_size: 50,
                page_token: pageToken,
                start_time: startTime?.toString(),
                end_time: endTime?.toString(),
                container_id_type: 'chat',
                container_id: chatId,
                sort_type: 'ByCreateTimeAsc',
            },
        }),
    );
}

export async function downloadResource(messageId: string, fileKey: string, type: 'image' | 'file') {
    return client.im.v1.messageResource.get({
        path: {
            message_id: messageId,
            file_key: fileKey,
        },
        params: {
            type,
        },
    });
}

export async function uploadFile(fileStream: Readable) {
    return client.im.v1.image.create({
        data: {
            image: fileStream as ReadStream,
            image_type: 'message',
        },
    });
}

export async function addChatMember(chat_id: string, open_id: string) {
    return handleResponse(
        client.im.chatMembers.create({
            path: { chat_id },
            params: { member_id_type: 'open_id' },
            data: {
                id_list: [open_id],
            },
        }),
    );
}
