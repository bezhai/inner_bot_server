import { LoggerFactory, LoggerConfig, LoggerTransportFactory } from '@inner/shared';
import { context } from '@middleware/context';

// Re-export types from shared
export { LoggerConfig, LoggerTransportFactory } from '@inner/shared';

// Create logger with context provider that includes botName
const logger = LoggerFactory.createLogger({
    logDir: process.env.LOG_DIR || '/var/log/main-server',
    contextProvider: () => ({
        traceId: context.getTraceId(),
        botName: context.getBotName(),
    }),
});

// Re-export LoggerFactory for advanced usage
export { LoggerFactory };

// Export default logger instance
export default logger;
