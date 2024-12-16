import { MongoClient } from "mongodb";
import { MongoCollection } from "./collection";
import { LarkMessageMetaInfo } from "../types/mongo";

// MongoDB 客户端实例
let db: MongoClient;

// 定义 MongoDB 集合实例
export let MessageColletion: MongoCollection<LarkMessageMetaInfo>;

export const mongoInitPromise = (async () => {
  try {
    const url = `mongodb://${process.env.MONGO_INITDB_ROOT_USERNAME}:${process.env.MONGO_INITDB_ROOT_PASSWORD}@${process.env.MONGO_INITDB_HOST}/chiwei?connectTimeoutMS=2000&authSource=admin`;

    db = new MongoClient(url);
    await db.connect(); // 连接到 MongoDB

    const database = db.db("chiwei"); // 选择数据库

    // 初始化各个集合
    MessageColletion = new MongoCollection<LarkMessageMetaInfo>(
      database.collection("lark_message")
    );

    console.log("MongoDB initialization completed.");
  } catch (err) {
    console.error("MongoDB initialization failed:", err);
    throw err;
  }
})();
