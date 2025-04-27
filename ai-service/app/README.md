# AI服务

AI服务是一个基于FastAPI的AI聊天和文本处理服务。

## 目录结构

```
ai-service/
├── app/                    # 应用程序主目录
│   ├── api/                # API路由模块
│   │   ├── chat.py         # 聊天相关API
│   │   ├── extraction.py   # 文本提取相关API
│   │   ├── router.py       # 路由汇总
│   │   └── __init__.py
│   ├── core/               # 核心功能模块
│   │   ├── event_system.py # 事件系统
│   │   ├── events.py       # 事件处理
│   │   ├── event_decorator.py # 事件装饰器
│   │   └── __init__.py
│   ├── services/           # 业务服务模块
│   │   ├── gpt.py          # GPT模型服务
│   │   ├── meta_info.py    # 元数据信息服务
│   │   ├── service.py      # AI聊天服务
│   │   └── __init__.py
│   ├── utils/              # 工具模块
│   │   ├── split_word.py   # 文本分词工具
│   │   └── __init__.py
│   ├── config/             # 配置模块
│   │   ├── config.py       # 配置设置
│   │   ├── logging_config.json # 日志配置
│   │   └── __init__.py
│   ├── main.py             # 应用入口
│   └── README.md           # 说明文档
├── requirements.txt        # 依赖包列表
└── Dockerfile              # Docker构建文件
```

## 模块说明

### API模块 (api/)

包含所有API路由定义和处理逻辑。

- `chat.py`: 聊天相关API端点
- `extraction.py`: 文本提取相关API端点
- `router.py`: 路由汇总文件

### 核心模块 (core/)

包含核心功能实现，如事件系统。

- `event_system.py`: 事件系统核心实现
- `events.py`: 事件处理和初始化
- `event_decorator.py`: 事件装饰器

### 服务模块 (services/)

包含业务逻辑服务。

- `gpt.py`: GPT模型定义和调用
- `meta_info.py`: 元数据和模型信息获取
- `service.py`: AI聊天服务实现

### 工具模块 (utils/)

包含工具函数和辅助功能。

- `split_word.py`: 文本分词工具

### 配置模块 (config/)

包含应用程序配置设置。

- `config.py`: 全局配置设置
- `logging_config.json`: 日志配置

## 启动服务

```bash
uvicorn app.main:app --reload
```
