# Message Processing (消息处理)

负责对接收到的消息进行解析、匹配与响应，结合规则引擎与 AI 服务产出结果。

## 目录结构

```
message-processing/
├── ai/              # AI 聊天能力
│   ├── service.ts   # AI 服务封装
│   └── stream/      # AI 流式响应处理
├── rules/           # 规则体系
│   ├── admin/       # 管理员规则
│   ├── general/     # 通用规则
│   └── group/       # 群聊规则
└── rule-engine.ts   # 规则匹配与执行引擎
```

## 核心组件

### Rule Engine（rule-engine.ts）

按顺序执行预定义规则，命中即触发处理器。

典型流程：
1. 去重：避免重复响应
2. 管理员命令处理
3. 通用规则（关键词、自动回复等）
4. 群组规则（如复读）

### rules/

分类管理具体规则，保持职责单一、便于扩展与测试。

## 如何新增规则

1. 在 `rules/` 下创建规则文件
2. 实现 `Rule` 接口，提供 `condition` 与 `action`
3. 在 `rule-engine.ts` 中将规则加入规则链