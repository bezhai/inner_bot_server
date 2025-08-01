# Main Server v2

A refactored version of the main server using NestJS and Domain-Driven Design principles.

## 🏗️ Architecture

This project follows Clean Architecture principles with the following layers:

- **Core**: Domain entities, value objects, and business logic
- **Adapters**: HTTP controllers, external service adapters
- **Infrastructure**: Database, cache, queue implementations
- **Shared**: Common utilities, configurations, and decorators

## 🚀 Getting Started

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 8.0.0
- Docker and Docker Compose (for local development)

### Installation

1. Install dependencies:
```bash
pnpm install
```

2. Set up environment variables:
```bash
cp .env.example .env
```

3. Start development services:
```bash
docker-compose up -d
```

4. Run database migrations:
```bash
pnpm run migrate:dev
```

### Development

Start the development server with hot reload:
```bash
pnpm run dev
```

### Testing

Run unit tests:
```bash
pnpm run test
```

Run tests in watch mode:
```bash
pnpm run test:watch
```

Run tests with coverage:
```bash
pnpm run test:cov
```

Run E2E tests:
```bash
pnpm run test:e2e
```

### Building

Build all packages:
```bash
pnpm run build
```

### Linting & Formatting

Run ESLint:
```bash
pnpm run lint
```

Fix linting issues:
```bash
pnpm run lint:fix
```

Format code:
```bash
pnpm run format
```

Check formatting:
```bash
pnpm run format:check
```

## 📦 Package Structure

```
packages/
├── core/        # Domain logic and use cases
├── adapters/    # External interfaces (HTTP, Lark, AI)
├── infra/       # Infrastructure implementations
└── shared/      # Shared utilities and configurations
```

## 🔧 Configuration

Configuration is managed through environment variables and the `@nestjs/config` module.

Key environment variables:
- `NODE_ENV`: Environment (development/production/test)
- `PORT`: Server port (default: 3000)
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `LARK_APP_ID`: Lark application ID
- `LARK_APP_SECRET`: Lark application secret

## 🐳 Docker

Build the Docker image:
```bash
docker build -t main-server-v2 .
```

Run with Docker Compose:
```bash
docker-compose up
```

## 📊 Monitoring

The application exposes the following endpoints:
- `/health`: Health check endpoint
- `/metrics`: Prometheus metrics
- `/docs`: Swagger API documentation

## 🤝 Contributing

1. Follow the conventional commits specification
2. Ensure all tests pass before submitting PR
3. Maintain test coverage above 90%
4. Update documentation as needed

## 📝 License

This project is proprietary and confidential.