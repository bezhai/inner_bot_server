import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { ConfigModule } from '@nestjs/config';

describe('Performance Tests (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        AppModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    app.setGlobalPrefix('api');
    
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  describe('Message Processing Performance', () => {
    it('should handle 100 concurrent messages within 10 seconds', async () => {
      const startTime = Date.now();
      const concurrentRequests = 100;
      const promises = [];

      // Create unique message events
      for (let i = 0; i < concurrentRequests; i++) {
        const messageEvent = {
          schema: '2.0',
          header: {
            event_id: `perf-event-${i}`,
            event_type: 'im.message.receive_v1',
            app_id: 'test-app-id',
            tenant_key: 'test-tenant',
            create_time: String(Date.now()),
            token: 'test-token',
          },
          event: {
            sender: {
              sender_id: {
                union_id: `perf-union-${i % 10}`, // 10 different users
                user_id: `perf-user-${i % 10}`,
                open_id: `perf-open-${i % 10}`,
              },
              sender_type: 'user',
              tenant_key: 'test-tenant',
            },
            message: {
              message_id: `perf-message-${i}`,
              root_id: '',
              parent_id: '',
              create_time: String(Date.now()),
              chat_id: `oc_perf-chat-${i % 5}`, // 5 different chats
              chat_type: 'group',
              message_type: 'text',
              content: `{"text":"Performance test message ${i}"}`,
              mentions: [],
            },
          },
        };

        promises.push(
          request(app.getHttpServer())
            .post('/api/webhook/lark/event')
            .send(messageEvent)
        );
      }

      // Execute all requests concurrently
      const results = await Promise.allSettled(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Analyze results
      const successful = results.filter(r => r.status === 'fulfilled' && (r as any).value.status === 200).length;
      const failed = results.filter(r => r.status === 'rejected').length;
      const rateLimited = results.filter(r => r.status === 'fulfilled' && (r as any).value.status === 429).length;

      console.log(`Performance test results:
        Total requests: ${concurrentRequests}
        Successful: ${successful}
        Failed: ${failed}
        Rate limited: ${rateLimited}
        Duration: ${duration}ms
        Avg response time: ${duration / concurrentRequests}ms
      `);

      // Assertions
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
      expect(successful + rateLimited).toBeGreaterThan(concurrentRequests * 0.95); // At least 95% should be processed (including rate limited)
      expect(failed).toBeLessThan(concurrentRequests * 0.05); // Less than 5% should fail
    }, 15000);

    it('should maintain low latency under sustained load', async () => {
      const testDuration = 5000; // 5 seconds
      const requestsPerSecond = 20;
      const latencies: number[] = [];
      let totalRequests = 0;

      const startTime = Date.now();
      const endTime = startTime + testDuration;

      while (Date.now() < endTime) {
        const batchPromises = [];
        const batchStartTime = Date.now();

        // Send batch of requests
        for (let i = 0; i < requestsPerSecond; i++) {
          const messageEvent = {
            schema: '2.0',
            header: {
              event_id: `sustained-event-${totalRequests}`,
              event_type: 'im.message.receive_v1',
              app_id: 'test-app-id',
              tenant_key: 'test-tenant',
              create_time: String(Date.now()),
              token: 'test-token',
            },
            event: {
              sender: {
                sender_id: {
                  union_id: `sustained-union-${totalRequests % 10}`,
                  user_id: `sustained-user-${totalRequests % 10}`,
                  open_id: `sustained-open-${totalRequests % 10}`,
                },
                sender_type: 'user',
                tenant_key: 'test-tenant',
              },
              message: {
                message_id: `sustained-message-${totalRequests}`,
                root_id: '',
                parent_id: '',
                create_time: String(Date.now()),
                chat_id: `oc_sustained-chat-${totalRequests % 5}`,
                chat_type: 'group',
                message_type: 'text',
                content: `{"text":"Sustained load test ${totalRequests}"}`,
                mentions: [],
              },
            },
          };

          const requestStartTime = Date.now();
          batchPromises.push(
            request(app.getHttpServer())
              .post('/api/webhook/lark/event')
              .send(messageEvent)
              .then(response => {
                const latency = Date.now() - requestStartTime;
                latencies.push(latency);
                return response;
              })
          );

          totalRequests++;
        }

        // Wait for batch to complete
        await Promise.allSettled(batchPromises);

        // Wait to maintain requests per second rate
        const batchDuration = Date.now() - batchStartTime;
        if (batchDuration < 1000) {
          await new Promise(resolve => setTimeout(resolve, 1000 - batchDuration));
        }
      }

      // Calculate latency statistics
      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const sortedLatencies = latencies.sort((a, b) => a - b);
      const p50 = sortedLatencies[Math.floor(latencies.length * 0.5)];
      const p95 = sortedLatencies[Math.floor(latencies.length * 0.95)];
      const p99 = sortedLatencies[Math.floor(latencies.length * 0.99)];

      console.log(`Sustained load test results:
        Total requests: ${totalRequests}
        Average latency: ${avgLatency.toFixed(2)}ms
        P50 latency: ${p50}ms
        P95 latency: ${p95}ms
        P99 latency: ${p99}ms
      `);

      // Assertions
      expect(avgLatency).toBeLessThan(200); // Average latency should be under 200ms
      expect(p95).toBeLessThan(500); // 95% of requests should complete within 500ms
      expect(p99).toBeLessThan(1000); // 99% of requests should complete within 1s
    }, 10000);
  });

  describe('Health Check Performance', () => {
    it('should respond to health checks quickly even under load', async () => {
      const healthCheckPromises = [];
      const messagePromises = [];

      // Send 50 message requests to create load
      for (let i = 0; i < 50; i++) {
        const messageEvent = {
          schema: '2.0',
          header: {
            event_id: `health-load-event-${i}`,
            event_type: 'im.message.receive_v1',
            app_id: 'test-app-id',
            tenant_key: 'test-tenant',
            create_time: String(Date.now()),
            token: 'test-token',
          },
          event: {
            sender: {
              sender_id: {
                union_id: `health-union-${i}`,
                user_id: `health-user-${i}`,
                open_id: `health-open-${i}`,
              },
              sender_type: 'user',
              tenant_key: 'test-tenant',
            },
            message: {
              message_id: `health-message-${i}`,
              root_id: '',
              parent_id: '',
              create_time: String(Date.now()),
              chat_id: `oc_health-chat-${i % 5}`,
              chat_type: 'group',
              message_type: 'text',
              content: `{"text":"Health check load test ${i}"}`,
              mentions: [],
            },
          },
        };

        messagePromises.push(
          request(app.getHttpServer())
            .post('/api/webhook/lark/event')
            .send(messageEvent)
        );
      }

      // Send 10 health check requests concurrently with message processing
      for (let i = 0; i < 10; i++) {
        const startTime = Date.now();
        healthCheckPromises.push(
          request(app.getHttpServer())
            .get('/api/health')
            .then(response => ({
              status: response.status,
              latency: Date.now() - startTime,
            }))
        );
      }

      // Wait for all requests
      const [healthResults] = await Promise.all([
        Promise.all(healthCheckPromises),
        Promise.allSettled(messagePromises),
      ]);

      // Analyze health check results
      const avgHealthLatency = healthResults.reduce((sum, r) => sum + r.latency, 0) / healthResults.length;
      const maxHealthLatency = Math.max(...healthResults.map(r => r.latency));

      console.log(`Health check under load results:
        Average health check latency: ${avgHealthLatency.toFixed(2)}ms
        Max health check latency: ${maxHealthLatency}ms
      `);

      // Assertions
      expect(healthResults.every(r => r.status === 200)).toBe(true);
      expect(avgHealthLatency).toBeLessThan(50); // Health checks should be fast
      expect(maxHealthLatency).toBeLessThan(100); // Even worst case should be under 100ms
    });
  });
});