import dotenv from "dotenv";
dotenv.config();

import { startLarkWebSocket } from "./services/larkWsService";

startLarkWebSocket();
