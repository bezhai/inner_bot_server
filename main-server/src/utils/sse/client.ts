/**
 * SSE 客户端配置选项
 */
export interface SSEClientOptions {
    /** 请求方法 */
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    /** 请求头 */
    headers?: Record<string, string>;
    /** 请求体 */
    body?: unknown;
    /** 重试次数，默认 3 次 */
    retries?: number;
    /** 重试延迟，默认 1000ms */
    retryDelay?: number;
    /** 是否自动重连，默认 true */
    autoReconnect?: boolean;
}

/**
 * SSE 消息类型
 */
export interface SSEMessage<T = unknown> {
    /** 消息数据 */
    data: T;
    /** 消息类型 */
    event?: string;
    /** 消息 ID */
    id?: string;
    /** 重试时间 */
    retry?: number;
}

/**
 * SSE 客户端类
 */
export class SSEClient<T = unknown> {
    private url: string;
    private options: Required<SSEClientOptions>;
    private abortController: AbortController | null = null;
    private retryCount = 0;
    private buffer = '';
    private isConnected = false;

    constructor(url: string, options: SSEClientOptions = {}) {
        this.url = url;
        this.options = {
            method: options.method || 'GET',
            headers: {
                Accept: 'text/event-stream',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive',
                ...options.headers,
            },
            body: options.body,
            retries: options.retries ?? 3,
            retryDelay: options.retryDelay ?? 1000,
            autoReconnect: options.autoReconnect ?? true,
        };
    }

    /**
     * 连接到 SSE 服务器
     * @param onMessage 消息回调
     * @param onError 错误回调
     * @returns 清理函数
     */
    public connect(
        onMessage: (message: SSEMessage<T>) => void,
        onError?: (error: unknown) => void,
    ): () => void {
        this.abortController = new AbortController();

        const connect = async () => {
            try {
                const response = await fetch(this.url, {
                    method: this.options.method,
                    headers: this.options.headers,
                    body: this.options.body ? JSON.stringify(this.options.body) : undefined,
                    signal: this.abortController?.signal,
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                if (!response.body) {
                    throw new Error('Response body is null');
                }

                this.isConnected = true;
                this.retryCount = 0;
                await this.readStream(response.body, onMessage);
            } catch (err) {
                this.isConnected = false;

                if (this.options.autoReconnect && this.retryCount < this.options.retries) {
                    this.retryCount++;
                    console.warn(`SSE连接失败，${this.options.retryDelay}ms后进行第${this.retryCount}次重试:`, err);
                    setTimeout(() => {
                        if (!this.abortController?.signal.aborted) connect();
                    }, this.options.retryDelay);
                } else {
                    // 所有重试都失败了，调用错误回调
                    if (onError) onError(err);
                }
            }
        };

        connect();

        return () => this.close();
    }

    /**
     * 关闭连接
     */
    public close(): void {
        this.isConnected = false;
        this.abortController?.abort();
        this.abortController = null;
    }

    private async readStream(
        body: ReadableStream<Uint8Array>,
        onMessage: (message: SSEMessage<T>) => void,
    ): Promise<void> {
        const reader = body.getReader();
        const decoder = new TextDecoder();

        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                this.buffer += decoder.decode(value, { stream: true });

                const messages = this.parseMessages();

                for (const message of messages) {
                    onMessage(message);
                }
            }
        } finally {
            reader.releaseLock();
        }
    }

    private parseMessages(): SSEMessage<T>[] {
        const messages: SSEMessage<T>[] = [];

        // 按照\r\n\r\n或\n\n分割消息（兼容不同的换行符）
        const messageChunks = this.buffer.split(/\r\n\r\n|\n\n/);

        // 保留最后一个不完整的消息块
        this.buffer = messageChunks.pop() || '';

        for (const chunk of messageChunks) {
            if (!chunk.trim()) continue;

            // 为每个消息创建新的对象
            const message: Partial<SSEMessage<T>> = {};
            const lines = chunk.split(/\r\n|\n/);
            const dataLines: string[] = [];

            for (const line of lines) {
                if (!line.trim()) continue;
                if (!line.includes(':')) continue;

                const colonIndex = line.indexOf(':');
                const field = line.substring(0, colonIndex).trim();
                let value = line.substring(colonIndex + 1).trim();

                switch (field) {
                    case 'data':
                        // 收集所有data行，稍后合并
                        dataLines.push(value);
                        break;
                    case 'event':
                        message.event = value;
                        break;
                    case 'id':
                        message.id = value;
                        break;
                    case 'retry':
                        const retry = parseInt(value, 10);
                        if (!isNaN(retry)) message.retry = retry;
                        break;
                }
            }

            // 处理data字段（多个data字段用换行符连接）
            if (dataLines.length > 0) {
                const dataStr = dataLines.join('\n');
                try {
                    message.data = JSON.parse(dataStr) as T;
                } catch {
                    message.data = dataStr as unknown as T;
                }

                // 只有包含data字段的消息才被推送
                messages.push(message as SSEMessage<T>);
            }
        }

        return messages;
    }
}
