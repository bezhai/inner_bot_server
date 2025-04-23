# Integrations

This directory contains integrations with external services:

## Directory Structure

```
integrations/
└── aliyun/        # Aliyun (阿里云) integration
    └── proxy.ts   # Aliyun proxy implementation
```

## Services

### Aliyun Integration

- Proxy service for Aliyun API interactions
- Handles authentication and requests to Aliyun services

## Adding New Integrations

When adding new external service integrations:

1. Create a new directory for the service
2. Implement service-specific clients/adapters
3. Document the integration in this README
