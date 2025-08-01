import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';

export interface QueueJob<T = any> {
  name: string;
  data: T;
  options?: {
    delay?: number;
    attempts?: number;
    backoff?: {
      type: 'exponential' | 'fixed';
      delay: number;
    };
    priority?: number;
  };
}

@Injectable()
export class MessageQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessageQueueService.name);
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();
  private connection: Redis;

  constructor(private readonly configService: ConfigService) {
    const redisConfig = {
      host: this.configService.get<string>('queue.redis.host'),
      port: this.configService.get<number>('queue.redis.port'),
    };
    
    this.connection = new Redis(redisConfig);
  }

  async onModuleInit() {
    // Initialize default queues
    await this.createQueue('message-processing');
    await this.createQueue('ai-generation');
    await this.createQueue('notifications');
  }

  async onModuleDestroy() {
    // Close all workers
    for (const worker of this.workers.values()) {
      await worker.close();
    }
    
    // Close all queues
    for (const queue of this.queues.values()) {
      await queue.close();
    }
    
    // Close connection
    await this.connection.quit();
  }

  async createQueue(name: string): Promise<Queue> {
    if (this.queues.has(name)) {
      return this.queues.get(name)!;
    }

    const queue = new Queue(name, {
      connection: this.connection,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    this.queues.set(name, queue);
    this.logger.log(`Queue '${name}' created`);
    
    return queue;
  }

  async addJob<T>(queueName: string, job: QueueJob<T>): Promise<string> {
    const queue = await this.getOrCreateQueue(queueName);
    const jobInstance = await queue.add(job.name, job.data, job.options);
    return jobInstance.id!;
  }

  async addBulkJobs<T>(queueName: string, jobs: QueueJob<T>[]): Promise<string[]> {
    const queue = await this.getOrCreateQueue(queueName);
    const jobInstances = await queue.addBulk(
      jobs.map(job => ({
        name: job.name,
        data: job.data,
        opts: job.options,
      }))
    );
    return jobInstances.map(j => j.id!);
  }

  createWorker<T>(
    queueName: string,
    processor: (job: Job<T>) => Promise<any>,
    concurrency?: number
  ): Worker {
    if (this.workers.has(queueName)) {
      throw new Error(`Worker for queue '${queueName}' already exists`);
    }

    const worker = new Worker(
      queueName,
      processor,
      {
        connection: this.connection,
        concurrency: concurrency || this.configService.get<number>('queue.concurrency', 5),
      }
    );

    worker.on('completed', (job) => {
      this.logger.debug(`Job ${job.id} completed in queue ${queueName}`);
    });

    worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} failed in queue ${queueName}:`, err);
    });

    this.workers.set(queueName, worker);
    this.logger.log(`Worker for queue '${queueName}' created with concurrency ${concurrency || 5}`);
    
    return worker;
  }

  async getJobCounts(queueName: string): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const queue = await this.getOrCreateQueue(queueName);
    return queue.getJobCounts();
  }

  async clean(queueName: string, grace: number = 0): Promise<void> {
    const queue = await this.getOrCreateQueue(queueName);
    await queue.clean(grace, 1000); // Clean jobs older than grace ms
  }

  async pause(queueName: string): Promise<void> {
    const queue = await this.getOrCreateQueue(queueName);
    await queue.pause();
  }

  async resume(queueName: string): Promise<void> {
    const queue = await this.getOrCreateQueue(queueName);
    await queue.resume();
  }

  private async getOrCreateQueue(name: string): Promise<Queue> {
    if (!this.queues.has(name)) {
      return this.createQueue(name);
    }
    return this.queues.get(name)!;
  }
}