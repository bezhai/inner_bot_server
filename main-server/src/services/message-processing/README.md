# Message Processing Service

This directory handles message processing, including both rule-based actions and AI responses.

## Directory Structure

```
message-processing/
├── ai/              # AI chat functionality
│   ├── service.ts   # AI service implementation
│   └── stream/      # Stream handling for AI responses
├── rules/           # Message processing rules
│   ├── admin/       # Administrative commands
│   │   ├── command-handler.ts
│   │   └── delete-message.ts
│   ├── group/       # Group-specific features
│   │   └── repeat-message.ts
│   └── general/     # General chat features
│       ├── history.ts
│       └── reply-handler.ts
└── rule-engine.ts   # Rule matching and execution engine
```

## Components

### AI Module (`ai/`)

Handles all AI-related functionality including:

- Chat completions
- Stream processing
- Message formatting

### Rules Module (`rules/`)

Contains all rule-based message processing logic:

- `admin/`: Administrative commands and moderation
- `group/`: Group chat specific functionality
- `general/`: General chat features and responses

### Rule Engine (`rule-engine.ts`)

Central rule processing system that:

- Matches incoming messages against defined rules
- Executes appropriate handlers
- Manages rule priority and fallthrough behavior
