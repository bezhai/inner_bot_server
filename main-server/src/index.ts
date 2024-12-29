import dotenv from "dotenv";
dotenv.config();

import { startLarkWebSocket } from "./services/larkEvent/service";
import { botInitialization } from "./services/initialize/main";
import { mongoInitPromise } from "./dal/mongo/client";
import AppDataSource from "./ormconfig";
import { getBotAppId } from "./utils/bot-var";

(async () => {
  try {
    console.log('Start initialization with bot', getBotAppId())
    await mongoInitPromise();
    await AppDataSource.initialize();
    console.log('Database connection established!');
    await botInitialization();
    console.log("Bot initialized successfully!");
    startLarkWebSocket();
  } catch (error) {
    console.error("Error during initialization:", error);
    process.exit(1);
  }
})();
