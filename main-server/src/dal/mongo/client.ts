import { MongoClient } from 'mongodb';
import { MongoCollection } from './collection';
import { LarkMessageMetaInfo } from 'types/mongo';
import { LarkOperateReactionInfo } from 'types/lark';

class MongoService {
    private static instance: MongoService;
    private client: MongoClient | null = null;
    private messageCollection: MongoCollection<LarkMessageMetaInfo> | null = null;
    private reactionCollection: MongoCollection<LarkOperateReactionInfo> | null = null;

    private constructor() {}

    public static getInstance(): MongoService {
        if (!MongoService.instance) {
            MongoService.instance = new MongoService();
        }
        return MongoService.instance;
    }

    public async initialize() {
        try {
            const {
                MONGO_INITDB_ROOT_USERNAME: username,
                MONGO_INITDB_ROOT_PASSWORD: password,
                MONGO_INITDB_HOST: host,
            } = process.env;

            const url =
                `mongodb://${username}:${password}@${host}/chiwei?` +
                `connectTimeoutMS=2000&` +
                `authSource=admin`;

            this.client = new MongoClient(url);
            await this.client.connect();

            const database = this.client.db('chiwei');

            // 初始化各个集合
            this.messageCollection = new MongoCollection<LarkMessageMetaInfo>(
                database.collection('lark_message'),
            );

            this.reactionCollection = new MongoCollection<LarkOperateReactionInfo>(
                database.collection('lark_reaction'),
            );

            console.info('MongoDB initialization completed.');
        } catch (err) {
            console.error('MongoDB initialization failed:', err);
            throw err;
        }
    }

    public getMessageCollection(): MongoCollection<LarkMessageMetaInfo> {
        if (!this.messageCollection) {
            throw new Error('MongoDB not initialized');
        }
        return this.messageCollection;
    }

    public getReactionCollection(): MongoCollection<LarkOperateReactionInfo> {
        if (!this.reactionCollection) {
            throw new Error('MongoDB not initialized');
        }
        return this.reactionCollection;
    }
}

// 导出单例实例
export const mongoService = MongoService.getInstance();

// 导出初始化函数
export const mongoInitPromise = async () => {
    await mongoService.initialize();
};

// 导出集合访问器
export const getMessageCollection = () => mongoService.getMessageCollection();
export const getReactionCollection = () => mongoService.getReactionCollection();
