import winston from 'winston';
import path from 'node:path';
import { context } from './context';

// 获取环境变量，决定是否写入文件
const enableFileLogging = process.env.ENABLE_FILE_LOGGING === 'true';
const logDir = process.env.LOG_DIR || '/var/log/main-server';
const logFileName = 'app.log';

// 创建 transport 数组
const transports: winston.transport[] = [
    // 控制台日志总是启用
    new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
            winston.format.printf((info) => {
                const traceId = context.getTraceId();
                return `${info.level}: ${info.message} ${traceId ? `[traceId: ${traceId}]` : ''}`;
            }),
        ),
    }),
];

// 如果启用了文件日志，添加文件 transport
if (enableFileLogging) {
    transports.push(
        new winston.transports.File({
            filename: path.join(logDir, logFileName),
            maxsize: 5242880, // 5MB
            maxFiles: 5,
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
        }),
    );
}

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    transports,
});

// 只在启用文件日志时重写 console 方法
if (enableFileLogging) {
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

export default logger;
