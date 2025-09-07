import { setWithExpire, evalScript } from '../../dal/redis';
import { randomBytes } from 'crypto';

interface LockOptions {
  key?: string | ((...args: any[]) => string);
  ttl?: number;
  timeout?: number;
  retryInterval?: number;
}

const UNLOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

export function RedisLock(options: LockOptions = {}) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      // 动态生成lockKey
      let lockKey: string;
      if (typeof options.key === 'function') {
        lockKey = options.key(...args);
      } else {
        lockKey = options.key || `lock:${target.constructor.name}:${propertyKey}`;
      }
      
      const lockValue = randomBytes(16).toString('hex');
      const ttl = options.ttl || 30;
      const timeout = options.timeout || 10000;
      const retryInterval = options.retryInterval || 100;
      
      const acquireLock = async (): Promise<boolean> => {
        const result = await setWithExpire(lockKey, lockValue, ttl);
        return result === 'OK';
      };
      
      const releaseLock = async (): Promise<void> => {
        await evalScript(UNLOCK_SCRIPT, 1, lockKey, lockValue);
      };
      
      const waitForLock = async (): Promise<void> => {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
          if (await acquireLock()) return;
          await new Promise(resolve => setTimeout(resolve, retryInterval));
        }
        throw new Error(`Failed to acquire lock for ${lockKey} within ${timeout}ms`);
      };
      
      await waitForLock();
      
      try {
        return await originalMethod.apply(this, args);
      } finally {
        await releaseLock();
      }
    };
    
    return descriptor;
  };
}
