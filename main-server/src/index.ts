import dotenv from "dotenv";
dotenv.config();

import { botInitialization } from "./services/initialize/main";
import { mongoInitPromise } from "./dal/mongo/client";
import AppDataSource from "./ormconfig";
import { startLarkWebSocket } from "./services/lark/events/service";
import { getBotAppId } from "./utils/bot/bot-var";

(async () => {
  try {
    console.log("Start initialization with bot", getBotAppId());
    await mongoInitPromise();
    await AppDataSource.initialize();
    console.log("Database connection established!");
    await botInitialization();
    console.log("Bot initialized successfully!");
    startLarkWebSocket();
  } catch (error) {
    console.error("Error during initialization:", error);
    process.exit(1);
  }
})();
