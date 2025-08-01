import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HttpHealthIndicator,
  MemoryHealthIndicator,
  DiskHealthIndicator,
} from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private http: HttpHealthIndicator,
    private memory: MemoryHealthIndicator,
    private disk: DiskHealthIndicator,
    private configService: ConfigService,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Basic health check' })
  check() {
    return this.health.check([
      // Check heap memory usage
      () => this.memory.checkHeap('memory_heap', 150 * 1024 * 1024), // 150MB
      
      // Check RSS memory usage
      () => this.memory.checkRSS('memory_rss', 300 * 1024 * 1024), // 300MB
      
      // Check disk storage
      () => this.disk.checkStorage('storage', { 
        path: '/', 
        thresholdPercent: 0.9 // 90% threshold
      }),
    ]);
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe for Kubernetes' })
  live() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe for Kubernetes' })
  async ready() {
    const aiServiceUrl = this.configService.get<string>('ai.serviceUrl');
    
    return this.health.check([
      // Check if AI service is reachable
      () => this.http.pingCheck('ai-service', `${aiServiceUrl}/health`),
    ]);
  }

  @Get('info')
  @ApiOperation({ summary: 'Get application information' })
  info() {
    return {
      name: 'main-server-v2',
      version: '2.0.0',
      environment: this.configService.get<string>('app.env'),
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      node: {
        version: process.version,
        memory: process.memoryUsage(),
        pid: process.pid,
      },
    };
  }
}