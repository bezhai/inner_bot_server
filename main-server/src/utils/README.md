# Utils (工具函数)

通用工具库，按功能分类组织。

## 目录结构

```
utils/
├── bot/            # 机器人相关工具（事件装饰器、上下文等）
├── cache/          # 缓存装饰器与工具
├── rate-limiting/  # 请求限流
├── state-machine/  # 通用状态机
├── text/           # 文本处理（分词、格式化等）
└── ...             # 其他工具
```

## 相关文档
- 缓存：请见 main-server/src/utils/cache/README.md