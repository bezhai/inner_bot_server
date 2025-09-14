import { AxiosResponse } from 'axios';
import crypto from 'node:crypto';
import {
    ListPixivImageDto,
    ImageForLark,
    BaseResponse,
    PaginationResponse,
    UploadImageToLarkDto,
    UploadLarkResp,
} from 'types/pixiv';
import {
    LarkFileTransferInfo,
    LarkFileTransferRequest,
    LarkFileTransferResponse,
} from 'types/aliyun';
import http from '../../../services/http';

// 生成盐
const generateSalt = (length: number): string => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = crypto.randomBytes(length);
    let salt = '';
    for (let i = 0; i < length; i++) {
        salt += letters[bytes[i] % letters.length];
    }
    return salt;
};

const generateToken = (salt: string, body: string, secret: string): string => {
    const data = salt + body + secret;
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    return hash;
};

/**
 * sendAuthenticatedRequest - 发送带有鉴权信息的 POST 请求
 * @param url 请求的 URL
 * @param reqBody 请求体
 * @returns 响应体
 */
async function sendAuthenticatedRequest<T>(url: string, reqBody: Record<string, any>): Promise<T> {
    const salt = generateSalt(10);
    const token = generateToken(salt, JSON.stringify(reqBody), process.env.PROXY_HTTP_SECRET!);

    try {
        const response: AxiosResponse<T> = await http.post<T>(url, reqBody, {
            headers: {
                'X-Salt': salt,
                'X-Token': token,
                'Content-Type': 'application/json',
            },
        });

        return response.data;
    } catch (error: any) {
        console.error('Error in sendAuthenticatedRequest:', error);
        throw new Error(`Request failed: ${error.message}`);
    }
}

export async function getPixivImages(params: ListPixivImageDto): Promise<ImageForLark[]> {
    try {
        const url = `${process.env.PROXY_HOST}/api/v2/image-store/token-auth-list`;

        // 发送带有身份认证的请求
        const response = await sendAuthenticatedRequest<
            BaseResponse<PaginationResponse<ImageForLark>>
        >(url, params);

        // 检查响应的 code 字段
        if (response.code !== 0) {
            throw new Error(response.msg);
        }

        return response.data.data;
    } catch (error: any) {
        console.error('Error in getPixivImages:', error);
        throw new Error(error.message || 'Unknown error');
    }
}

export async function getLarkFileTransferUrl(
    params: LarkFileTransferRequest,
): Promise<LarkFileTransferInfo> {
    try {
        const url = `${process.env.PROXY_HOST}/api/v2/lark-file-transfer`;

        // 发送带有身份认证的请求
        const response = await sendAuthenticatedRequest<BaseResponse<LarkFileTransferResponse>>(
            url,
            params,
        );

        // 检查响应的 code 字段
        if (response.code !== 0) {
            throw new Error(response.msg);
        }

        return {
            file_key: params.file_key,
            url: response.data.url,
        };
    } catch (error: any) {
        console.error('Error in getLarkFileTransferUrl:', error);
        throw new Error(error.message || 'Unknown error');
    }
}

export async function uploadToLark(params: UploadImageToLarkDto): Promise<UploadLarkResp> {
    try {
        const url = `${process.env.PROXY_HOST}/api/v2/image-store/upload-lark`;

        // 发送带有身份认证的请求
        const response = await sendAuthenticatedRequest<BaseResponse<UploadLarkResp>>(url, params);

        // 检查响应的 code 字段
        if (response.code !== 0) {
            throw new Error(response.msg);
        }

        return response.data;
    } catch (error: any) {
        console.error('Error in getPixivImages:', error);
        throw new Error(error.message || 'Unknown error');
    }
}
