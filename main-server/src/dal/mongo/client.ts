import { MongoClient } from "mongodb";
import { MongoCollection } from "./collection";
import {
  LarkChatInfo,
  LarkGroupMember,
  LarkMessageMetaInfo,
  LarkUser,
} from "../../types/mongo";

// MongoDB 客户端实例
let db: MongoClient;

// 定义 MongoDB 集合实例
export let MessageCollection: MongoCollection<LarkMessageMetaInfo>;
export let LarkUserCollection: MongoCollection<LarkUser>;
export let LarkGroupMemberCollection: MongoCollection<LarkGroupMember>;
export let LarkChatCollection: MongoCollection<LarkChatInfo>;

export const mongoInitPromise = (async () => {
  try {
    const url = `mongodb://${process.env.MONGO_INITDB_ROOT_USERNAME}:${process.env.MONGO_INITDB_ROOT_PASSWORD}@${process.env.MONGO_INITDB_HOST}/chiwei?connectTimeoutMS=2000&authSource=admin`;

    db = new MongoClient(url);
    await db.connect();

    const database = db.db("chiwei");

    // 初始化各个集合
    MessageCollection = new MongoCollection<LarkMessageMetaInfo>(
      database.collection("lark_message")
    );
    LarkUserCollection = new MongoCollection<LarkUser>(
      database.collection("lark_user")
    );
    LarkGroupMemberCollection = new MongoCollection<LarkGroupMember>(
      database.collection("lark_group_member")
    );
    LarkChatCollection = new MongoCollection<LarkChatInfo>(
      database.collection("lark_chat")
    );

    console.log("MongoDB initialization completed.");
  } catch (err) {
    console.error("MongoDB initialization failed:", err);
    throw err;
  }
});
