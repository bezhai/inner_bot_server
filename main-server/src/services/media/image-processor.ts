import { downloadResource } from '../integrations/lark-client';
import { getOss } from '../integrations/aliyun/oss';
import { cache } from '../../utils/cache/cache-decorator';
import { get as redisGet, setWithExpire as redisSetWithExpire } from '../../dal/redis';
import { Readable } from 'node:stream';
import sharp from 'sharp';

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
    async processImage(request: ImageProcessRequest): Promise<ImageProcessResponse> {
        const { message_id, file_key } = request;
        
        console.info(`开始处理图片: message_id=${message_id}, file_key=${file_key}`);
        
        try {
            // 第一层缓存：检查文件是否已上传（7天缓存）
            let fileName = await this.checkFileUploaded(file_key);
            
            if (!fileName) {
                // 文件未上传，需要下载并上传
                console.debug(`文件未上传，开始下载和上传: file_key=${file_key}`);
                
                // 下载图片
                const imageStream = await this.downloadImage(message_id, file_key);
                
                // 上传到OSS
                fileName = await this.uploadToOssOnly(file_key, imageStream);
                
                // 记录到第一层缓存
                await this.recordFileUploaded(file_key, fileName);
            } else {
                console.debug(`文件已上传，跳过下载和上传: file_key=${file_key}, fileName=${fileName}`);
            }
            
            // 第二层缓存：生成URL（1小时缓存）
            const url = await this.getFileUrlWithCache(fileName);
            
            console.info(`图片处理成功: ${url}`);
            
            return {
                success: true,
                data: {
                    url,
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
     * 检查文件是否已上传（第一层缓存）
     */
    private async checkFileUploaded(fileKey: string): Promise<string | null> {
        const cacheKey = `image_upload:${fileKey}`;
        const fileName = await redisGet(cacheKey);
        return fileName;
    }

    /**
     * 记录文件已上传（第一层缓存，7天TTL）
     */
    private async recordFileUploaded(fileKey: string, fileName: string): Promise<void> {
        const cacheKey = `image_upload:${fileKey}`;
        const ttl = 7 * 24 * 60 * 60; // 7天
        await redisSetWithExpire(cacheKey, fileName, ttl);
    }

    /**
     * 获取文件URL（第二层缓存，1小时TTL）
     */
    @cache({ type: 'redis', ttl: 3600 }) // 1小时缓存
    private async getFileUrlWithCache(fileName: string): Promise<string> {
        return await getOss().getFileUrl(fileName, false);
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
     * 上传图片到OSS（仅上传，不获取URL）
     */
    private async uploadToOssOnly(fileKey: string, imageStream: Readable): Promise<string> {
        try {
            const fileName = `temp/${fileKey}.jpg`;
            
            // 压缩图片
            const compressedBuffer = await this.compressImage(imageStream);
            
            await getOss().uploadFile(fileName, compressedBuffer);
            
            console.debug(`成功上传到OSS: ${fileName}`);
            return fileName;
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
     * 压缩图片 - 简单版本
     */
    private async compressImage(imageStream: Readable): Promise<Buffer> {
        try {
            // 将流转为Buffer
            const chunks: Buffer[] = [];
            for await (const chunk of imageStream) {
                chunks.push(chunk);
            }
            const originalBuffer = Buffer.concat(chunks);

            // 使用Sharp压缩
            const compressedBuffer = await sharp(originalBuffer)
                .resize(1440, 1440, {
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .jpeg({
                    quality: 80,
                    progressive: true
                })
                .toBuffer();

            console.debug(`图片压缩完成: ${originalBuffer.length} -> ${compressedBuffer.length} bytes`);
            return compressedBuffer;

        } catch (error) {
            console.warn('图片压缩失败，使用原图:', error);
            
            // 压缩失败时，将流转为Buffer返回原图
            const chunks: Buffer[] = [];
            for await (const chunk of imageStream) {
                chunks.push(chunk);
            }
            return Buffer.concat(chunks);
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