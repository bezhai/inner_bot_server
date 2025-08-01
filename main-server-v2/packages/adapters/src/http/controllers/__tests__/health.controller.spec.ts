import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from '../health.controller';
import { HealthCheckService, HttpHealthIndicator, MemoryHealthIndicator, DiskHealthIndicator } from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';

describe('HealthController', () => {
  let controller: HealthController;
  let healthCheckService: HealthCheckService;

  const mockHealthCheckService = {
    check: jest.fn(),
  };

  const mockHttpHealthIndicator = {
    pingCheck: jest.fn(),
  };

  const mockMemoryHealthIndicator = {
    checkHeap: jest.fn(),
    checkRSS: jest.fn(),
  };

  const mockDiskHealthIndicator = {
    checkStorage: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string) => {
      const config: Record<string, any> = {
        'app.env': 'test',
        'ai.serviceUrl': 'http://localhost:8000',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthCheckService,
          useValue: mockHealthCheckService,
        },
        {
          provide: HttpHealthIndicator,
          useValue: mockHttpHealthIndicator,
        },
        {
          provide: MemoryHealthIndicator,
          useValue: mockMemoryHealthIndicator,
        },
        {
          provide: DiskHealthIndicator,
          useValue: mockDiskHealthIndicator,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    healthCheckService = module.get<HealthCheckService>(HealthCheckService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('live', () => {
    it('should return ok status', () => {
      const result = controller.live();
      expect(result.status).toBe('ok');
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('info', () => {
    it('should return application information', () => {
      const result = controller.info();
      expect(result.name).toBe('main-server-v2');
      expect(result.version).toBe('2.0.0');
      expect(result.environment).toBe('test');
      expect(result.uptime).toBeDefined();
      expect(result.node).toBeDefined();
      expect(result.node.version).toBe(process.version);
    });
  });

  describe('check', () => {
    it('should perform health checks', async () => {
      const mockHealthResult = {
        status: 'ok',
        info: {
          memory_heap: { status: 'up' },
          memory_rss: { status: 'up' },
          storage: { status: 'up' },
        },
        error: {},
        details: {},
      };

      mockHealthCheckService.check.mockResolvedValue(mockHealthResult);

      const result = await controller.check();
      expect(result).toEqual(mockHealthResult);
      expect(healthCheckService.check).toHaveBeenCalled();
    });
  });

  describe('ready', () => {
    it('should check if services are ready', async () => {
      const mockReadyResult = {
        status: 'ok',
        info: {
          'ai-service': { status: 'up' },
        },
        error: {},
        details: {},
      };

      mockHealthCheckService.check.mockResolvedValue(mockReadyResult);

      const result = await controller.ready();
      expect(result).toEqual(mockReadyResult);
      expect(healthCheckService.check).toHaveBeenCalled();
    });
  });
});