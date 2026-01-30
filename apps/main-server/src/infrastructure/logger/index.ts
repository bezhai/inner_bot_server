import winston from 'winston';
import path from 'node:path';
import util from 'node:util';
import { context } from '@middleware/context';

function errorToPlainObject(error: Error): Record<string, unknown> {
    const plain: Record<string, unknown> = {
        name: error.name,
        message: error.message,
        stack: error.stack,
    };

    // Node.js v16+ / modern TS: Error may have `cause`
    const cause = (error as unknown as { cause?: unknown }).cause;
    if (cause !== undefined) {
        plain.cause = cause;
    }

    // Preserve enumerable custom fields on Error subclasses
    for (const [key, value] of Object.entries(error)) {
        if (!(key in plain)) {
            plain[key] = value;
        }
    }

    return plain;
}

function safeJsonStringify(value: unknown): string {
    const seen = new WeakSet<object>();
    return JSON.stringify(
        value,
        (_key, val: unknown) => {
            if (val instanceof Error) {
                return errorToPlainObject(val);
            }

            if (typeof val === 'bigint') {
                return val.toString();
            }

            if (typeof val === 'object' && val !== null) {
                const obj = val as object;
                if (seen.has(obj)) {
                    return '[Circular]';
                }
                seen.add(obj);
            }

            return val;
        },
    );
}

function formatConsoleArg(arg: unknown): string {
    if (arg instanceof Error) {
        return arg.stack || `${arg.name}: ${arg.message}`;
    }
    if (typeof arg === 'string') {
        return arg;
    }
    if (arg === null) {
        return 'null';
    }
    if (arg === undefined) {
        return 'undefined';
    }
    if (typeof arg === 'bigint') {
        return arg.toString();
    }
    if (typeof arg === 'object') {
        // Avoid JSON.stringify on Error / circular structures; keep it readable.
        return util.inspect(arg, { depth: 6, breakLength: 120 });
    }
    return String(arg);
}

/**
 * 日志配置接口
 */
export interface LoggerConfig {
    level: string;
    enableFileLogging: boolean;
    logDir: string;
    logFileName: string;
    maxFileSize: number;
    maxFiles: number;
    enableConsoleOverride: boolean;
}

/**
 * 日志传输器工厂
 */
export class LoggerTransportFactory {
    /**
     * 创建控制台传输器
     */
    static createConsoleTransport(): winston.transport {
        return new winston.transports.Console({
            format: winston.format.combine(
                winston.format.errors({ stack: true }),
                winston.format.colorize(),
                winston.format.printf((info) => {
                    const traceId = context.getTraceId();
                    const message = info.stack || info.message;
                    return `${info.level}: ${message} ${traceId ? `[traceId: ${traceId}]` : ''}`;
                }),
            ),
        });
    }

    /**
     * 创建文件传输器
     */
    static createFileTransport(config: LoggerConfig): winston.transport {
        return new winston.transports.File({
            filename: path.join(config.logDir, config.logFileName),
            maxsize: config.maxFileSize,
            maxFiles: config.maxFiles,
            format: winston.format.combine(
                winston.format.errors({ stack: true }),
                winston.format.timestamp(),
                winston.format.printf((info) => {
                    const traceId = context.getTraceId();
                    return safeJsonStringify({
                        ...info,
                        traceId,
                    });
                }),
            ),
        });
    }

    /**
     * 创建自定义传输器（用于测试）
     */
    static createCustomTransport(transport: winston.transport): winston.transport {
        return transport;
    }
}

/**
 * 日志工厂类
 */
export class LoggerFactory {
    private static instance: winston.Logger | null = null;
    private static config: LoggerConfig | null = null;

    /**
     * 创建默认配置
     */
    static createDefaultConfig(): LoggerConfig {
        return {
            level: process.env.LOG_LEVEL || 'info',
            enableFileLogging: process.env.ENABLE_FILE_LOGGING === 'true',
            logDir: process.env.LOG_DIR || '/var/log/main-server',
            logFileName: 'app.log',
            maxFileSize: 5242880, // 5MB
            maxFiles: 5,
            enableConsoleOverride: true,
        };
    }

    /**
     * 创建日志器实例
     */
    static createLogger(config: LoggerConfig = this.createDefaultConfig()): winston.Logger {
        this.config = config;

        const transports: winston.transport[] = [LoggerTransportFactory.createConsoleTransport()];

        // 如果启用了文件日志，添加文件传输器
        if (config.enableFileLogging) {
            transports.push(LoggerTransportFactory.createFileTransport(config));
        }

        const logger = winston.createLogger({
            level: config.level,
            transports,
        });

        // 如果启用了控制台重写且启用了文件日志
        if (config.enableConsoleOverride && config.enableFileLogging) {
            this.overrideConsoleMethods(logger);
        }

        this.instance = logger;
        return logger;
    }

    /**
     * 创建测试日志器（使用自定义传输器）
     */
    static createTestLogger(transports: winston.transport[]): winston.Logger {
        return winston.createLogger({
            level: 'debug',
            transports,
        });
    }

    /**
     * 获取日志器实例
     */
    static getInstance(): winston.Logger {
        if (!this.instance) {
            return this.createLogger();
        }
        return this.instance;
    }

    /**
     * 重置日志器实例（用于测试）
     */
    static reset(): void {
        this.instance = null;
        this.config = null;
    }

    /**
     * 重写控制台方法
     */
    private static overrideConsoleMethods(logger: winston.Logger): void {
        // eslint-disable-next-line no-console
        console.log = (...args) => {
            const traceId = context.getTraceId();
            logger.info(
                args.map(formatConsoleArg).join(' '),
                { traceId },
            );
        };

        console.error = (...args) => {
            const traceId = context.getTraceId();
            logger.error(
                args.map(formatConsoleArg).join(' '),
                { traceId },
            );
        };

        console.info = (...args) => {
            const traceId = context.getTraceId();
            logger.info(
                args.map(formatConsoleArg).join(' '),
                { traceId },
            );
        };

        console.warn = (...args) => {
            const traceId = context.getTraceId();
            logger.warn(
                args.map(formatConsoleArg).join(' '),
                { traceId },
            );
        };
    }

    /**
     * 获取当前配置
     */
    static getConfig(): LoggerConfig | null {
        return this.config;
    }
}

// 导出默认日志器实例
export default LoggerFactory.getInstance();
