import winston from 'winston';
import path from 'path';

// 获取环境变量，决定是否写入文件
const enableFileLogging = process.env.ENABLE_FILE_LOGGING === 'true';
const logDir = process.env.LOG_DIR || '/var/log/main-server';
const logFileName = 'app.log';

// 创建 transport 数组
const transports: winston.transport[] = [
  // 控制台日志总是启用
  new winston.transports.Console({
    format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
  }),
];

// 如果启用了文件日志，添加文件 transport
if (enableFileLogging) {
  transports.push(
    new winston.transports.File({
      filename: path.join(logDir, logFileName),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    }),
  );
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports,
});

// 只在启用文件日志时重写 console 方法
if (enableFileLogging) {
  console.log = (...args) => {
    logger.info(args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : arg)).join(' '));
  };

  console.error = (...args) => {
    logger.error(args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : arg)).join(' '));
  };

  console.info = (...args) => {
    logger.info(args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : arg)).join(' '));
  };

  console.warn = (...args) => {
    logger.warn(args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : arg)).join(' '));
  };
}

export default logger;
