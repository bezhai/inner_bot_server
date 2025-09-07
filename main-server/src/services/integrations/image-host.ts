import {
    UploadImageResponse,
    ImageUploadData,
} from '../../types/image-post';
import axios from 'axios';
import dayjs from 'dayjs';
import FormData from 'form-data';
import { Readable } from 'node:stream';

const BASE_URL = 'https://picui.cn/api/v1';

export async function uploadImages(file: Readable): Promise<ImageUploadData> {
    // 构建 FormData
    const formData = new FormData();
    formData.append('file', file);
    formData.append('permission', 0); // 私有
    formData.append('expired_at', dayjs().add(1, 'day').format('YYYY-MM-DD HH:mm:ss'));

    try {
        // 发送上传请求
        const response = await axios.post<UploadImageResponse>(`${BASE_URL}/upload`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
                Accept: 'application/json',
                ...(process.env.IMAGE_HOST_TOKEN && {
                    Authorization: `Bearer ${process.env.IMAGE_HOST_TOKEN}`,
                }),
                ...formData.getHeaders(),
            },
        });

        // 检查 API 响应状态
        if (!response.data.status) {
            throw new Error(`上传失败: ${response.data.message}`);
        }

        // 检查是否有数据返回
        if (!response.data.data) {
            throw new Error('上传成功但未返回图片数据');
        }

        console.info(`上传成功: ${response.data.message}`);

        return response.data.data;
    } catch (error) {
        // 处理 HTTP 错误
        if (axios.isAxiosError(error)) {
            const status = error.response?.status;
            const message = error.response?.data?.message || error.message;

            switch (status) {
                case 401:
                    throw new Error(`认证失败: ${message}`);
                case 403:
                    throw new Error(`权限不足或接口已关闭: ${message}`);
                case 429:
                    throw new Error(`请求过于频繁，请稍后重试: ${message}`);
                case 500:
                    throw new Error(`服务器内部错误: ${message}`);
                default:
                    throw new Error(`上传请求失败: ${message}`);
            }
        }

        throw error;
    }
}
