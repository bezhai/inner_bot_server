import Router from '@koa/router';

const router = new Router();

router.get('/api/config', async (ctx) => {
  const kibanaHost = process.env.DASHBOARD_KIBANA_HOST || '';
  const langfuseHost = process.env.DASHBOARD_LANGFUSE_HOST || '';
  const langfuseProjectId = process.env.DASHBOARD_LANGFUSE_PROJECT_ID || '';

  ctx.body = {
    kibanaUrl: `${kibanaHost}/app/discover`,
    langfuseUrl: `${langfuseHost}/project/${langfuseProjectId}`,
  };
});

export default router;
