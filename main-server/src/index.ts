import dotenv from "dotenv";
dotenv.config();

import { botInitialization } from "./services/initialize/main";
import { mongoInitPromise } from "./dal/mongo/client";
import AppDataSource from "./ormconfig";
import { getBotAppId } from "./utils/bot/bot-var";
import Koa from "koa";
import Router from "@koa/router";
import koaBody from "koa-body";
import { cardActionRouter, eventRouter } from "./services/lark/events/service";

(async () => {
  try {
    console.log("Start initialization with bot", getBotAppId());
    await mongoInitPromise();
    await AppDataSource.initialize();
    console.log("Database connection established!");
    await botInitialization();
    console.log("Bot initialized successfully!");
    const server = new Koa();
    const router = new Router();
    server.use(koaBody());
    router.post("/webhook/event", eventRouter);
    router.post("/webhook/card", cardActionRouter);
    server.use(router.routes());
    server.listen(3000);
  } catch (error) {
    console.error("Error during initialization:", error);
    process.exit(1);
  }
})();
