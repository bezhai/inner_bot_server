import dotenv from "dotenv";
dotenv.config();

import { startLarkWebSocket } from "./services/larkWsService";
import { botInitialization } from "./services/initialize/main";
import { mongoInitPromise } from "./dal/mongo/client";

(async () => {
  try {
    await mongoInitPromise();
    await botInitialization();
    console.log("Bot initialized successfully!");
    startLarkWebSocket();
  } catch (error) {
    console.error("Error during initialization:", error);
    process.exit(1);
  }
})();
