/**
 * Agent系统性能基准测试
 */

import { HumanMessage } from '@langchain/core/messages';
import { performance } from 'perf_hooks';

import {
    AgentFactory,
    UnifiedAgent,
    AgentManager,
    OutputMode,
    AgentRunResult
} from './index';
import { availableTools } from './tools';

interface BenchmarkResult {
    testName: string;
    duration: number;
    success: boolean;
    error?: string;
    metadata?: any;
}

/**
 * 性能基准测试类
 */
export class AgentBenchmark {
    private apiKey: string;
    private baseUrl?: string;

    constructor(apiKey: string = 'test-key', baseUrl?: string) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
    }

    /**
     * 测试Agent创建性能
     */
    public async benchmarkAgentCreation(): Promise<BenchmarkResult> {
        const testName = 'Agent创建性能测试';
        const startTime = performance.now();

        try {
            const config = AgentFactory.createSimpleConfig(
                'gpt-3.5-turbo',
                this.apiKey,
                this.baseUrl
            );

            // 创建多个agent测试创建性能
            const agents = [];
            for (let i = 0; i < 10; i++) {
                const agent = AgentFactory.createReactAgent(config, [availableTools.calculator]);
                agents.push(new UnifiedAgent(agent));
            }

            const duration = performance.now() - startTime;
            
            return {
                testName,
                duration,
                success: true,
                metadata: { agentsCreated: agents.length }
            };
        } catch (error) {
            return {
                testName,
                duration: performance.now() - startTime,
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * 测试工具添加性能
     */
    public async benchmarkToolManagement(): Promise<BenchmarkResult> {
        const testName = '工具管理性能测试';
        const startTime = performance.now();

        try {
            const config = AgentFactory.createSimpleConfig('gpt-3.5-turbo', this.apiKey, this.baseUrl);
            const agent = AgentFactory.createReactAgent(config);
            
            // 测试大量工具添加
            const tools = Object.values(availableTools);
            for (let i = 0; i < 100; i++) {
                agent.addTools(tools);
            }

            const duration = performance.now() - startTime;
            
            return {
                testName,
                duration,
                success: true,
                metadata: { 
                    finalToolCount: agent.getTools().length,
                    iterations: 100
                }
            };
        } catch (error) {
            return {
                testName,
                duration: performance.now() - startTime,
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * 测试Manager并发性能
     */
    public async benchmarkManagerConcurrency(): Promise<BenchmarkResult> {
        const testName = 'Manager并发性能测试';
        const startTime = performance.now();

        try {
            const manager = AgentManager.createPreconfiguredManager(
                'gpt-3.5-turbo',
                this.apiKey,
                this.baseUrl
            );

            // 并发创建多个agent
            const createPromises = [];
            for (let i = 0; i < 20; i++) {
                createPromises.push(
                    Promise.resolve(manager.createSingleAgent(
                        `agent_${i}`,
                        {},
                        [availableTools.calculator]
                    ))
                );
            }

            await Promise.all(createPromises);

            // 健康检查
            const health = await manager.healthCheck();

            manager.cleanup();

            const duration = performance.now() - startTime;
            
            return {
                testName,
                duration,
                success: true,
                metadata: { 
                    agentsCreated: health.totalAgents,
                    healthCheck: health.healthy
                }
            };
        } catch (error) {
            return {
                testName,
                duration: performance.now() - startTime,
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * 内存使用测试
     */
    public async benchmarkMemoryUsage(): Promise<BenchmarkResult> {
        const testName = '内存使用测试';
        const startTime = performance.now();

        try {
            const initialMemory = process.memoryUsage();
            
            // 创建大量agent实例
            const agents = [];
            for (let i = 0; i < 50; i++) {
                const config = AgentFactory.createSimpleConfig('gpt-3.5-turbo', this.apiKey);
                const agent = AgentFactory.createReactAgent(config, Object.values(availableTools));
                agents.push(new UnifiedAgent(agent));
            }

            const afterCreationMemory = process.memoryUsage();
            
            // 清理引用
            agents.length = 0;
            
            // 强制垃圾回收（如果可用）
            if (global.gc) {
                global.gc();
            }
            
            const afterCleanupMemory = process.memoryUsage();
            const duration = performance.now() - startTime;
            
            return {
                testName,
                duration,
                success: true,
                metadata: {
                    initialHeapUsed: Math.round(initialMemory.heapUsed / 1024 / 1024),
                    afterCreationHeapUsed: Math.round(afterCreationMemory.heapUsed / 1024 / 1024),
                    afterCleanupHeapUsed: Math.round(afterCleanupMemory.heapUsed / 1024 / 1024),
                    memoryIncrease: Math.round((afterCreationMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024),
                    memoryReclaimed: Math.round((afterCreationMemory.heapUsed - afterCleanupMemory.heapUsed) / 1024 / 1024)
                }
            };
        } catch (error) {
            return {
                testName,
                duration: performance.now() - startTime,
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * 运行所有基准测试
     */
    public async runAllBenchmarks(): Promise<BenchmarkResult[]> {
        console.log('🏃‍♂️ 开始运行性能基准测试...\n');

        const tests = [
            this.benchmarkAgentCreation(),
            this.benchmarkToolManagement(),
            this.benchmarkManagerConcurrency(),
            this.benchmarkMemoryUsage()
        ];

        const results = await Promise.all(tests);

        console.log('📊 基准测试结果汇总:');
        console.log('═'.repeat(60));
        
        results.forEach(result => {
            console.log(`${result.success ? '✅' : '❌'} ${result.testName}`);
            console.log(`   ⏱️  耗时: ${result.duration.toFixed(2)}ms`);
            if (result.metadata) {
                console.log(`   📋 详情:`, result.metadata);
            }
            if (result.error) {
                console.log(`   ❌ 错误:`, result.error);
            }
            console.log('');
        });

        const successCount = results.filter(r => r.success).length;
        console.log(`🎯 测试通过率: ${successCount}/${results.length} (${(successCount/results.length*100).toFixed(1)}%)`);

        return results;
    }
}

/**
 * 运行基准测试
 */
export async function runBenchmarks() {
    const benchmark = new AgentBenchmark(
        process.env.OPENAI_API_KEY || 'test-key',
        process.env.OPENAI_BASE_URL
    );

    return await benchmark.runAllBenchmarks();
}

// 如果直接运行此文件
if (require.main === module) {
    runBenchmarks().catch(console.error);
}