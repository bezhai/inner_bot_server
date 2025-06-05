import { Readable } from 'node:stream';

/**
 * 将Readable流转换为base64字符串
 * @param stream Readable流
 * @returns Promise<string> base64字符串
 */
export async function streamToBase64(stream: Readable): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on('error', (err) => reject(err));
        stream.on('end', () => {
            const buffer = Buffer.concat(chunks);
            resolve(buffer.toString('base64'));
        });
    });
}
