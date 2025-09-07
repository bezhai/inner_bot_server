import { downloadResource } from '../integrations/lark-client';
import { getOss } from '../integrations/aliyun/oss';
import { cache } from '../../utils/cache/cache-decorator';
import { Readable } from 'node:stream';

/**
 * 图片处理请求接口
 */
export interface ImageProcessRequest {
    message_id: string;
    file_key: string;
}

/**
 * 图片处理响应接口
 */
export interface ImageProcessResponse {
    success: boolean;
    data?: {
        url: string;
        file_key: string;
    };
    message: string;
    error_code?: string;
}

/**
 * 图片处理错误类
 */
export class ImageProcessError extends Error {
    constructor(
        message: string,
        public code: string,
        public statusCode: number = 500
    ) {
        super(message);
        this.name = 'ImageProcessError';
    }
}

/**
 * 图片处理服务类
 */
export class ImageProcessorService {
    private static instance: ImageProcessorService;

    private constructor() {}

    static getInstance(): ImageProcessorService {
        if (!ImageProcessorService.instance) {
            ImageProcessorService.instance = new ImageProcessorService();
        }
        return ImageProcessorService.instance;
    }

    /**
     * 处理图片：下载并上传到OSS
     */
    @cache({ type: 'redis', ttl: 21600 }) // 6小时缓存
    async processImage(request: ImageProcessRequest): Promise<ImageProcessResponse> {
        const { message_id, file_key } = request;
        
        console.info(`开始处理图片: message_id=${message_id}, file_key=${file_key}`);
        
        try {
            // 下载图片
            const imageStream = await this.downloadImage(message_id, file_key);
            
            // 上传到OSS
            const uploadResult = await this.uploadToOss(file_key, imageStream);
            
            console.info(`图片处理成功: ${uploadResult.url}`);
            
            return {
                success: true,
                data: {
                    url: uploadResult.url,
                    file_key
                },
                message: '图片处理成功'
            };
        } catch (error) {
            console.error(`图片处理失败: message_id=${message_id}, file_key=${file_key}`, error);
            throw this.handleError(error);
        }
    }

    /**
     * 从Lark下载图片
     */
    private async downloadImage(messageId: string, fileKey: string): Promise<Readable> {
        try {
            const downloadResponse = await downloadResource(messageId, fileKey, 'image');
            const imageStream = downloadResponse.getReadableStream();
            
            if (!imageStream) {
                throw new ImageProcessError(
                    '无法获取图片流',
                    'DOWNLOAD_STREAM_ERROR',
                    400
                );
            }
            
            console.debug(`成功下载图片流: file_key=${fileKey}`);
            return imageStream;
        } catch (error) {
            if (error instanceof ImageProcessError) {
                throw error;
            }
            throw new ImageProcessError(
                `下载图片失败: ${error instanceof Error ? error.message : '未知错误'}`,
                'DOWNLOAD_ERROR',
                500
            );
        }
    }

    /**
     * 上传图片到OSS
     */
    private async uploadToOss(fileKey: string, imageStream: Readable) {
        try {
            const fileName = `temp/${fileKey}.jpg`;
            const result = await getOss().uploadFile(fileName, imageStream);
            
            // 使用getFileUrl获取链接，isForDownload为false
            const url = await getOss().getFileUrl(fileName, false);
            
            if (!url) {
                throw new ImageProcessError(
                    'OSS上传成功但无法获取URL',
                    'UPLOAD_NO_URL_ERROR',
                    500
                );
            }
            
            console.debug(`成功上传到OSS: ${fileName} -> ${url}`);
            return { ...result, url };
        } catch (error) {
            if (error instanceof ImageProcessError) {
                throw error;
            }
            throw new ImageProcessError(
                `上传到OSS失败: ${error instanceof Error ? error.message : '未知错误'}`,
                'UPLOAD_ERROR',
                500
            );
        }
    }

    /**
     * 统一错误处理
     */
    private handleError(error: unknown): ImageProcessError {
        if (error instanceof ImageProcessError) {
            return error;
        }
        
        if (error instanceof Error) {
            return new ImageProcessError(
                `图片处理失败: ${error.message}`,
                'PROCESSING_ERROR',
                500
            );
        }
        
        return new ImageProcessError(
            '图片处理失败: 未知错误',
            'UNKNOWN_ERROR',
            500
        );
    }
}

// 导出单例实例
export const imageProcessor = ImageProcessorService.getInstance();