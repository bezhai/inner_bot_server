import Router from '@koa/router';
import axios from 'axios';

const router = new Router();

router.get('/api/token-stats', async (ctx) => {
  const apiId = process.env.DASHBOARD_TOKEN_STATS_API_ID || '';

  const response = await axios.post(
    'https://claudelike.online/apiStats/api/user-stats',
    { apiId },
    { timeout: 10000 }
  );

  ctx.body = response.data;
});

export default router;
