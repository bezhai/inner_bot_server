import dotenv from 'dotenv';
dotenv.config();

import Koa from "koa";
import { startLarkWebSocket } from './services/larkWsService';

const app = new Koa();

app.use(async (ctx) => {
  ctx.body = "Hello, TypeScript with Koa!";
});

startLarkWebSocket();

app.listen(3000, () => {
  console.log("Server is running on http://localhost:3000");
});

