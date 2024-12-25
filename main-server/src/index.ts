import dotenv from "dotenv";
dotenv.config();

import { startLarkWebSocket } from "./services/larkEvent/service";
import { botInitialization } from "./services/initialize/main";
import { mongoInitPromise } from "./dal/mongo/client";
import AppDataSource from "./ormconfig";

(async () => {
  try {
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
