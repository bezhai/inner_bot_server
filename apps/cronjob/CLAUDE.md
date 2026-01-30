# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Node.js cronjob service that handles automated tasks including:
- **Pixiv artwork downloads**: Downloads images from Pixiv based on followed artists and tags
- **Bangumi anime data sync**: Synchronizes anime subject data from Bangumi API to MongoDB
- **Daily photo delivery**: Sends curated photos via Lark/Feishu messaging
- **Redis-based task queue**: Manages download tasks with rate limiting and retry logic

## Architecture

### Core Components

- **Entry Point**: `src/index.ts` - Sets up cron schedules and starts async consumers
- **Services**: Business logic for downloads, syncs, and notifications
- **API Layer**: External API integrations (Bangumi, Pixiv, Lark)
- **Data Layer**: MongoDB collections and Redis caching
- **Utilities**: Helper functions for caching, calculations, and rate limiting

### Data Flow

1. **Download Pipeline**: Pixiv API → Redis cache → MongoDB tasks → Async processing
2. **Bangumi Sync**: Bangumi API → Rate limiter → MongoDB upserts
3. **Photo Delivery**: MongoDB queries → Lark messaging → User notifications

## Development Commands

### Build & Run
```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run locally (requires .env)
node dist/index.js

# Docker development
make all          # Pull, build, and run container
make build        # Build Docker image only
make run          # Run container
make stop         # Stop container
make clean        # Clean up containers and images
```

### Environment Setup
Required `.env` variables:
```bash
# MongoDB
MONGO_URL=mongodb://localhost:27017/chiwei_bot

# Redis
REDIS_URL=redis://localhost:6379

# Lark/Feishu
FEISHU_APP_ID=your_app_id
FEISHU_APP_SECRET=your_app_secret
SELF_CHAT_ID=your_chat_id

# Bangumi API (optional)
BANGUMI_BASE_URL=https://api.bgm.tv
```

### Scheduled Tasks
Cron schedules defined in `src/index.ts`:
- **10:00 daily**: Download new Pixiv artworks
- **18:00 daily**: Send daily photos
- **19:29 daily**: Send new photos
- **Async**: Continuous Bangumi data sync (currently manual)

## Key Services

### Download Service (`src/service/dailyDownload.ts`)
- Fetches followed Pixiv artists tagged "已上传"
- Implements Redis-based download cooldown (2-4 days per artist)
- Uses sliding window rate limiting for API calls
- Queues download tasks to MongoDB

### Bangumi Sync (`src/service/bangumiSyncService.ts`)
- Syncs anime subjects (type=2) from Bangumi API
- Implements sliding window rate limiting (3 requests/minute)
- Handles pagination and retry logic
- Sends failure notifications via Lark

### Photo Delivery (`src/service/dailySendPhoto.ts`)
- Retrieves curated photos from MongoDB
- Sends daily photo messages via Lark
- Handles new vs existing photo differentiation

## Database Schema

### MongoDB Collections
- **bangumi_subjects**: Anime subject data from Bangumi
- **download_tasks**: Queued download tasks
- **photos**: Downloaded photo metadata

### Redis Keys
- `download_user_dict`: Last download timestamps per artist
- `ban_illusts`: Blocked artwork IDs

## Testing & Debugging

Current project has no test framework. Add tests with:
```bash
npm install --save-dev jest @types/jest ts-jest
```

For debugging:
1. Check MongoDB connection logs
2. Monitor Redis keys with `redis-cli monitor`
3. View Lark bot messages for error notifications
4. Check Docker logs: `docker logs chiwei_cronjob`