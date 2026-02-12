import 'reflect-metadata';
import path from 'path';
import fs from 'fs';
import Koa from 'koa';
import Router from '@koa/router';
import cors from '@koa/cors';
import bodyParser from 'koa-bodyparser';
import serve from 'koa-static';
import './load-env';

import { AppDataSource } from './db';
import { initMongo } from './mongo';
import { jwtAuth } from './middleware/jwt-auth';

import authRoutes from './routes/auth';
import configRoutes from './routes/config';
import tokenStatsRoutes from './routes/token-stats';
import messagesRoutes from './routes/messages';
import providersRoutes from './routes/providers';
import modelMappingsRoutes from './routes/model-mappings';
import mongoRoutes from './routes/mongo';

const PORT = Number(process.env.DASHBOARD_PORT || 3002);

const bootstrap = async () => {
  await AppDataSource.initialize();
  await initMongo();

  const app = new Koa();
  const router = new Router();

  if (process.env.NODE_ENV !== 'production') {
    app.use(cors());
  }

  app.use(bodyParser({ jsonLimit: '2mb' }));
  app.use(jwtAuth);

  router.use(authRoutes.routes());
  router.use(configRoutes.routes());
  router.use(tokenStatsRoutes.routes());
  router.use(messagesRoutes.routes());
  router.use(providersRoutes.routes());
  router.use(modelMappingsRoutes.routes());
  router.use(mongoRoutes.routes());

  app.use(router.routes());
  app.use(router.allowedMethods());

  const clientDistPath = path.resolve(__dirname, '../client/dist');
  if (fs.existsSync(clientDistPath)) {
    app.use(serve(clientDistPath));

    app.use(async (ctx) => {
      if (ctx.path.startsWith('/api')) {
        return;
      }
      ctx.type = 'html';
      ctx.body = fs.createReadStream(path.join(clientDistPath, 'index.html'));
    });
  }

  if (process.env.DASHBOARD_LOG_ENV === 'true') {
    // eslint-disable-next-line no-console
    console.log('[monitor-dashboard] env summary', {
      dashboardPort: process.env.DASHBOARD_PORT,
      postgresHost: process.env.POSTGRES_HOST,
      postgresDb: process.env.POSTGRES_DB,
      mongoHost: process.env.MONGO_HOST,
      nodeEnv: process.env.NODE_ENV,
    });
  }

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Monitor dashboard server running on ${PORT}`);
  });
};

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start monitor dashboard:', err);
  process.exit(1);
});
