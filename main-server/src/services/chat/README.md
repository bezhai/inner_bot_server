# Chat Service

This directory contains the core chat functionality and rule processing:

## Directory Structure

```
chat/
├── core/           # Core chat functionality
│   ├── ai-service.ts
│   ├── openai-service.ts
│   └── stream/     # Stream handling
├── rules/          # Chat rules organized by category
│   ├── admin/      # Administrative commands
│   │   ├── command-handler.ts
│   │   └── delete-message.ts
│   ├── group/      # Group-specific features
│   │   └── repeat-message.ts
│   └── general/    # General chat features
│       ├── gen-history.ts
│       └── reply-handler.ts
└── match-rule.ts   # Rule matching and execution
```

## Rule Categories

- `admin/`: Administrative commands and moderation
- `group/`: Group chat specific functionality
- `general/`: General chat features and responses

## Core Components

- `core/`: Contains core chat services including AI integration
- `match-rule.ts`: Central rule processing and execution
