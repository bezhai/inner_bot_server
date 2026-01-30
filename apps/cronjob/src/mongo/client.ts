import { MongoClient, Collection } from "mongodb";
import { MongoCollection } from "./collection";
import { DownloadTask, PixivImageInfo, TranslateWord } from "./types";

// MongoDB 客户端实例
let db: MongoClient;

// 定义 MongoDB 集合实例
export let ImgCollection: MongoCollection<PixivImageInfo>;
export let DownloadTaskMap: MongoCollection<DownloadTask>;
export let TranslateWordMap: MongoCollection<TranslateWord>;

// Bangumi Archive 集合实例（使用原生 Collection）
export let BangumiSubjectCollection: Collection;
export let BangumiCharacterCollection: Collection;
export let BangumiPersonCollection: Collection;
export let BangumiEpisodeCollection: Collection;
export let BangumiSubjectCharacterCollection: Collection;
export let BangumiSubjectPersonCollection: Collection;
export let BangumiPersonCharacterCollection: Collection;
export let BangumiSubjectRelationCollection: Collection;

/**
 * 创建 Bangumi Archive 相关的索引
 */
async function createBangumiIndexes(database: any): Promise<void> {
  console.log('开始创建 Bangumi Archive 索引...');
  
  try {
    // 主实体表索引（单字段唯一索引）
    await BangumiSubjectCollection.createIndex({ "id": 1 }, { unique: true, background: true, name: "idx_id_unique" });
    await BangumiCharacterCollection.createIndex({ "id": 1 }, { unique: true, background: true, name: "idx_id_unique" });
    await BangumiPersonCollection.createIndex({ "id": 1 }, { unique: true, background: true, name: "idx_id_unique" });
    await BangumiEpisodeCollection.createIndex({ "id": 1 }, { unique: true, background: true, name: "idx_id_unique" });
    
    // 关系表索引（复合唯一索引）
    await BangumiSubjectCharacterCollection.createIndex(
      { "subject_id": 1, "character_id": 1 }, 
      { unique: true, background: true, name: "idx_subject_id_character_id_unique" }
    );
    await BangumiSubjectPersonCollection.createIndex(
      { "subject_id": 1, "person_id": 1 }, 
      { unique: true, background: true, name: "idx_subject_id_person_id_unique" }
    );
    await BangumiPersonCharacterCollection.createIndex(
      { "person_id": 1, "character_id": 1 }, 
      { unique: true, background: true, name: "idx_person_id_character_id_unique" }
    );
    await BangumiSubjectRelationCollection.createIndex(
      { "subject_id": 1, "relation_subject_id": 1 }, 
      { unique: true, background: true, name: "idx_subject_id_relation_subject_id_unique" }
    );
    
    console.log('Bangumi Archive 索引创建完成');
  } catch (error: any) {
    // 索引已存在或其他非致命错误，记录但不中断初始化
    if (error.code !== 85) { // 85 = IndexOptionsConflict
      console.warn('创建 Bangumi Archive 索引时警告:', error.message);
    } else {
      console.log('Bangumi Archive 索引已存在，跳过创建');
    }
  }
}

export const mongoInitPromise = (async () => {
  try {

    const url = `mongodb://${process.env.MONGO_INITDB_ROOT_USERNAME}:${process.env.MONGO_INITDB_ROOT_PASSWORD}@${process.env.MONGO_HOST || 'mongo'}/chiwei?connectTimeoutMS=2000&authSource=admin`;

    db = new MongoClient(url);
    await db.connect(); // 连接到 MongoDB

    const database = db.db("chiwei"); // 选择数据库

    // 初始化各个集合
    ImgCollection = new MongoCollection<PixivImageInfo>(
      database.collection("img_map")
    );
    DownloadTaskMap = new MongoCollection<DownloadTask>(
      database.collection("download_task")
    );
    TranslateWordMap = new MongoCollection<TranslateWord>(
      database.collection("trans_map")
    );

    // 初始化 Bangumi Archive 集合
    BangumiSubjectCollection = database.collection("bangumi_archive_subjects");
    BangumiCharacterCollection = database.collection("bangumi_archive_characters");
    BangumiPersonCollection = database.collection("bangumi_archive_persons");
    BangumiEpisodeCollection = database.collection("bangumi_archive_episodes");
    BangumiSubjectCharacterCollection = database.collection("bangumi_archive_subject_characters");
    BangumiSubjectPersonCollection = database.collection("bangumi_archive_subject_persons");
    BangumiPersonCharacterCollection = database.collection("bangumi_archive_person_characters");
    BangumiSubjectRelationCollection = database.collection("bangumi_archive_subject_relations");

    // 创建 Bangumi Archive 索引
    // await createBangumiIndexes(database);

    console.log("MongoDB initialization completed.");
  } catch (err) {
    console.error("MongoDB initialization failed:", err);
    throw err;
  }
})();
