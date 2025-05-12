# Inner Bot Server

Inner Bot Server 是一个基于事件驱动的微服务架构项目，用于提供智能对话和数据处理服务。

## 项目架构

项目由以下主要组件构成：

- **main-server**: 主服务器，负责请求处理和业务逻辑
- **ai-service**: AI 服务，提供智能对话能力

## 技术栈

- 开发语言：TypeScript/JavaScript 和 Python
- 事件总线：Redis
- 容器化：Docker

## 快速开始

### 环境要求

- Node.js >= 16
- Python >= 3.8
- Docker
- Redis

### 安装依赖

1. 安装 Python 依赖：

```bash
cd main-server
pip install -r requirements.txt
```

2. 安装 Node.js 依赖：

```bash
cd ai-service
npm install
```

### 配置

1. 复制环境变量模板：

```bash
cp .env.example .env
```

2. 根据实际环境修改 `.env` 文件中的配置

### 启动服务

使用 Docker Compose 启动所有服务：

```bash
docker compose up
```

## 文档

- [事件系统使用指南](docs/event_system.md)
- [部署指南](docs/deployment.md)

## 开发指南

- 代码风格遵循项目配置的 ESLint 和 Black 规范
- 提交代码前请确保通过所有测试
- 遵循[语义化提交信息](https://www.conventionalcommits.org/)规范

## 许可证

[MIT](LICENSE)
