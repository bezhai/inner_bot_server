import winston from 'winston';
import path from 'node:path';
import { context } from '../middleware/context';

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
                winston.format.colorize(),
                winston.format.simple(),
                winston.format.printf((info) => {
                    const traceId = context.getTraceId();
                    return `${info.level}: ${info.message} ${traceId ? `[traceId: ${traceId}]` : ''}`;
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
                winston.format.timestamp(),
                winston.format.printf((info) => {
                    const traceId = context.getTraceId();
                    return JSON.stringify({
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
                args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : arg)).join(' '),
                { traceId },
            );
        };

        console.error = (...args) => {
            const traceId = context.getTraceId();
            logger.error(
                args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : arg)).join(' '),
                { traceId },
            );
        };

        console.info = (...args) => {
            const traceId = context.getTraceId();
            logger.info(
                args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : arg)).join(' '),
                { traceId },
            );
        };

        console.warn = (...args) => {
            const traceId = context.getTraceId();
            logger.warn(
                args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : arg)).join(' '),
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
