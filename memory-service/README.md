# Memory Service

飞书闲聊记忆框架服务 / Feishu Chat Memory Framework Service

## 概述

这是一个基于FastAPI的记忆服务，为飞书聊天机器人提供记忆存储和检索功能。该服务实现了三层记忆模型（短期记忆、中期记忆和长期记忆），支持智能的消息分类、主题摘要和用户画像管理。

## 特性

- **消息异步写入**：支持聊天消息的异步存储和处理
- **快速检索**：提供短期记忆的快速检索接口
- **主题检索**：支持基于主题的深度搜索
- **健康检查**：内置健康检查接口
- **API文档**：自动生成的API文档

## 技术栈

- **框架**：FastAPI
- **包管理**：uv
- **Python版本**：3.13+
- **部署**：Docker

## 安装和运行

### 使用uv（推荐）

```bash
# 安装依赖
uv sync

# 启动开发服务器
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 使用Docker

```bash
# 构建镜像
docker build -t memory-service .

# 运行容器
docker run -p 8000:8000 memory-service
```

## API接口

### 主要接口

- `POST /api/v1/memory/message` - 消息存储
- `POST /api/v1/memory/quick_search` - 快速检索
- `POST /api/v1/memory/topic_search` - 主题检索
- `GET /health` - 健康检查

### API文档

启动服务后，可以通过以下地址访问API文档：

- Swagger UI: <http://localhost:8000/docs>
- ReDoc: <http://localhost:8000/redoc>

## 项目结构

```
memory-service/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI应用主文件
│   ├── api/
│   │   ├── __init__.py
│   │   └── memory.py        # 记忆相关API
│   ├── models/
│   │   ├── __init__.py
│   │   └── memory.py        # 数据模型
│   └── core/
├── main.py                  # 项目入口文件
├── pyproject.toml          # 项目配置
├── uv.lock                 # 依赖锁定文件
├── Dockerfile              # Docker构建文件
└── README.md               # 项目文档
```

## 开发计划

当前版本只包含API接口定义，后续需要实现以下功能：

- [ ] 数据库连接和ORM
- [ ] 向量数据库集成
- [ ] 消息处理和分类逻辑
- [ ] 记忆层次管理
- [ ] 用户画像构建
- [ ] 主题摘要生成
- [ ] 配置管理
- [ ] 日志系统
- [ ] 测试用例

## 贡献

欢迎提交Issue和Pull Request来改进这个项目。

## 许可证

[添加许可证信息]
