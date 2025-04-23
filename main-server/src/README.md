# Inner Bot Server

This is the main TypeScript server implementation for the Inner Bot project.

## Project Structure

```
src/
├── dal/                # Data Access Layer
│   ├── entities/       # Database entities
│   ├── mongo/         # MongoDB client and collections
│   ├── repositories/  # Data repositories
│   ├── lark-client.ts
│   └── redis.ts
├── models/            # Data models and types
├── services/          # Core services
│   ├── chat/         # Chat processing and rules
│   ├── lark/         # Lark (飞书) integration
│   ├── media/        # Media handling (photos, memes)
│   └── integrations/ # External service integrations
├── types/            # TypeScript type definitions
└── utils/            # Utility functions
    ├── text/         # Text processing
    ├── rate-limiting/
    └── bot/          # Bot utilities
```

## Key Components

- `dal/`: Database and external client implementations
- `services/`: Core business logic and service implementations
    - `chat/`: Main chat processing and rule engine
    - `lark/`: Lark platform integration
    - `media/`: Media handling services
    - `integrations/`: External service integrations
- `utils/`: Shared utility functions
- `types/`: TypeScript type definitions
- `models/`: Shared data models

## Service Organization

Each major service is organized in its own directory with a README explaining its structure and purpose:

- [Chat Service](services/chat/README.md)
- [Lark Integration](services/lark/README.md)
- [Media Service](services/media/README.md)
- [Integrations](services/integrations/README.md)
- [Utils](utils/README.md)
