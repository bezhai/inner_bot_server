import Koa from 'koa';
import Router from '@koa/router';
import koaBody from 'koa-body';
import cors from '@koa/cors';
import { errorHandler } from '@middleware/error-handler';
import { traceMiddleware } from '@middleware/trace';
import { botContextMiddleware } from '@middleware/bot-context';
import imageProcessRoutes from '@api/routes/image.route';
import { multiBotManager } from '@core/services/bot/multi-bot-manager';
import { StartupStrategyManager } from '@lark/startup-strategy';
import { HttpRouterConfig } from '@lark/router';

/**
 * 路由配置接口
 */
export interface RouteConfig {
    eventPath: string;
    cardPath: string;
}

/**
 * 服务器配置
 */
export interface ServerConfig {
    port: number;
    routeConfig: RouteConfig;
}

/**
 * HTTP 服务器管理器
 */
export class HttpServerManager {
    private app: Koa;
    private router: Router;
    private config: ServerConfig;

    constructor(
        config: ServerConfig = {
            port: 3000,
            routeConfig: {
                eventPath: '/webhook/{botName}/event',
                cardPath: '/webhook/{botName}/card',
            },
        },
    ) {
        this.config = config;
        this.app = new Koa();
        this.router = new Router();
        this.setupMiddleware();
    }

    /**
     * 设置中间件
     */
    private setupMiddleware(): void {
        this.app.use(cors());
        this.app.use(traceMiddleware); // 先注入 traceId（为后续日志与错误处理提供上下文）
        this.app.use(errorHandler); // 统一错误处理（依赖 traceId 贯穿）
        this.app.use(botContextMiddleware); // 注入 botName
        this.app.use(koaBody({
            formLimit: '50mb',
            jsonLimit: '50mb',
            textLimit: '50mb',
            multipart: true,
        }));
    }

    /**
     * 注册机器人路由
     */
    private registerBotRoutes(httpRouters: HttpRouterConfig[]): void {
        for (const botRouter of httpRouters) {
            // 使用配置化的路由路径
            const eventPath = this.config.routeConfig.eventPath.replace(
                '{botName}',
                botRouter.botName,
            );
            const cardPath = this.config.routeConfig.cardPath.replace(
                '{botName}',
                botRouter.botName,
            );

            this.router.post(eventPath, botRouter.eventRouter);
            this.router.post(cardPath, botRouter.cardActionRouter);

            console.info(`Bot ${botRouter.botName} routes registered: ${eventPath}, ${cardPath}`);
        }
    }

    /**
     * 注册健康检查端点
     */
    private registerHealthCheck(): void {
        this.router.get('/api/health', (ctx) => {
            try {
                const allBots = multiBotManager.getAllBotConfigs();
                ctx.body = {
                    status: 'ok',
                    timestamp: new Date().toISOString(),
                    service: 'main-server',
                    bots: allBots.map((bot) => ({
                        name: bot.bot_name,
                        app_id: bot.app_id,
                        init_type: bot.init_type,
                        is_active: bot.is_active,
                    })),
                };
                ctx.status = 200;
            } catch (error) {
                ctx.body = {
                    status: 'error',
                    message: error instanceof Error ? error.message : 'Unknown error',
                };
                ctx.status = 500;
            }
        });
    }

    /**
     * 启动 HTTP 服务器
     */
    async start(): Promise<void> {
        // 初始化 HTTP 路由
        const httpBots = multiBotManager.getBotsByInitType('http');
        if (httpBots.length > 0) {
            const httpRouters = (await StartupStrategyManager.executeStrategy(
                'http',
                httpBots,
            )) as HttpRouterConfig[];
            this.registerBotRoutes(httpRouters);
        }

        // 注册健康检查和其他路由
        this.registerHealthCheck();
        this.app.use(this.router.routes());
        this.app.use(imageProcessRoutes.routes());

        // 启动服务器
        this.app.listen(this.config.port);
        console.info(`HTTP server started on port ${this.config.port}`);
        this.logAvailableRoutes();
    }

    /**
     * 记录可用路由
     */
    private logAvailableRoutes(): void {
        console.info('Available routes:');
        console.info('  - /api/health (health check)');
        console.info('  - /api/prompts (prompt management)');
        console.info('  - /api/image/process (image processing)');
        console.info('  - /api/image/upload-base64 (base64 image upload)');

        const httpBots = multiBotManager.getBotsByInitType('http');
        httpBots.forEach((bot) => {
            const eventPath = this.config.routeConfig.eventPath.replace('{botName}', bot.bot_name);
            const cardPath = this.config.routeConfig.cardPath.replace('{botName}', bot.bot_name);
            console.info(`  - ${eventPath}`);
            console.info(`  - ${cardPath}`);
        });
    }

    /**
     * 获取 Koa 应用实例（用于测试）
     */
    getApp(): Koa {
        return this.app;
    }
}
