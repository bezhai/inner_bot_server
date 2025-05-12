import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as redisClient from '../dal/redis';
import { getEventSystem } from './event-system';

interface GroupChangeMsg {
    topic: string;
    group_id: string;
    action: 'register' | 'unregister';
}

class GroupStreamManager {
    private groupWorkers: Map<string, { running: boolean; stop: () => void }> = new Map();
    private eventEmitter = new EventEmitter();
    private started = false;
    private defaultTimeout = 30_000;

    async start() {
        if (this.started) return;
        await redisClient.subscribe('group_change', this.handleGroupChange.bind(this));
        this.started = true;
        console.log('[GroupStream] Manager started');
    }

    async stop() {
        if (!this.started) return;
        for (const { stop } of this.groupWorkers.values()) {
            stop();
        }
        this.groupWorkers.clear();
        this.started = false;
        console.log('[GroupStream] Manager stopped');
    }

    private async handleGroupChange(_channel: string, msg: string) {
        try {
            const info: GroupChangeMsg = JSON.parse(msg);
            const { topic, group_id, action } = info;
            const key = `${topic}:${group_id}`;
            if (action === 'register') {
                if (!this.groupWorkers.has(key)) {
                    const stop = this.startGroupWorker(topic, group_id);
                    this.groupWorkers.set(key, { running: true, stop });
                    console.log(`[GroupStream] Started worker for ${key}`);
                }
            } else if (action === 'unregister') {
                const worker = this.groupWorkers.get(key);
                if (worker) {
                    worker.stop();
                    this.groupWorkers.delete(key);
                    console.log(`[GroupStream] Stopped worker for ${key}`);
                }
            }
        } catch (e) {
            console.error('[GroupStream] handleGroupChange error:', e);
        }
    }

    private startGroupWorker(topic: string, groupId: string): () => void {
        let stopped = false;
        let lastId = '$';
        const streamKey = `event_stream:${topic}:${groupId}`;
        const eventSystem = getEventSystem();

        const loop = async () => {
            while (!stopped) {
                try {
                    const events = await redisClient.xread(
                        'BLOCK',
                        this.defaultTimeout,
                        'STREAMS',
                        streamKey,
                        lastId,
                    );
                    if (!events) continue;
                    for (const [stream, entries] of events) {
                        for (const [entryId, entryArr] of entries) {
                            try {
                                let dataStr = '';
                                for (let i = 0; i < entryArr.length; i += 2) {
                                    if (entryArr[i] === 'data') {
                                        dataStr = entryArr[i + 1];
                                        break;
                                    }
                                }
                                const data = JSON.parse(dataStr);
                                // 使用 eventSystem 分发给已注册的 handlers
                                const handlers = eventSystem['handlers'].get(topic);
                                if (handlers && handlers.length > 0) {
                                    for (const handler of handlers) {
                                        await Promise.resolve(handler(data));
                                    }
                                } else {
                                    console.warn(`[GroupStream] No handler for topic: ${topic}`);
                                }
                                lastId = entryId;
                            } catch (e) {
                                console.error('[GroupStream] Error handling group event:', e);
                            }
                        }
                    }
                } catch (e) {
                    if (!stopped) {
                        console.error('[GroupStream] Worker error:', e);
                        await new Promise((res) => setTimeout(res, 1000));
                    }
                }
            }
        };
        loop();
        return () => {
            stopped = true;
        };
    }
}

// 单例
let _groupStreamManager: GroupStreamManager | null = null;
export function getGroupStreamManager(): GroupStreamManager {
    if (!_groupStreamManager) {
        _groupStreamManager = new GroupStreamManager();
    }
    return _groupStreamManager;
}

/**
 * 注册分组消费（启动分组worker）
 * @param topic 事件主题
 * @param groupId 分组ID
 */
export async function registerGroup(topic: string, groupId: string) {
    await redisClient.publish(
        'group_change',
        JSON.stringify({
            topic,
            group_id: groupId,
            action: 'register',
        }),
    );
}

/**
 * 注销分组消费（停止分组worker）
 * @param topic 事件主题
 * @param groupId 分组ID
 */
export async function unregisterGroup(topic: string, groupId: string) {
    await redisClient.publish(
        'group_change',
        JSON.stringify({
            topic,
            group_id: groupId,
            action: 'unregister',
        }),
    );
}

/**
 * 向指定分组流发布事件
 * @param topic 主题
 * @param groupId 分组ID
 * @param payload 事件数据
 */
export async function publishGroupEvent(topic: string, groupId: string, payload: any) {
    const streamKey = `event_stream:${topic}:${groupId}`;
    await redisClient.xadd(streamKey, '*', 'data', JSON.stringify(payload));
}
