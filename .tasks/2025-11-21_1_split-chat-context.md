# 背景
文件名：2025-11-21_1
创建于：2025-11-21_18:42:41
创建者：ubuntu
主分支：main
任务分支：task/split-chat-context_2025-11-21_1
Yolo模式：Off
flow: standard

# 任务描述
目前群聊和私聊共用同一套Agent上下文架构，群聊会把历史对话压缩成一条message，但私聊不需要这种压缩。需要拆分群聊与私聊的上下文构建方案，让私聊保持完整上下文。

# 项目概览
LangChain驱动的AI聊天服务，现有主Agent上下文统一在app/agents/main/context_builder.py内构建，quick_search提供消息历史。

⚠️ 警告：永远不要修改此部分 ⚠️
遵循RIPER-5协议：按模式推进（Research→Innovate→Plan→Execute→Review），保持模式声明；所有实现严格按PLAN；执行阶段记录任务进展；审查阶段比对计划与实现。
⚠️ 警告：永远不要修改此部分 ⚠️

# 分析
`app/agents/main/context_builder.py` 通过 `quick_search` 拉取历史消息后，统一将非触发消息格式化为一段 `chat_history` 文本，并把触发消息自身格式化为 `trigger_content`；最终 `build_chat_context` 无论群聊还是私聊都返回同一个 `ChatContext`，仅在 `get_prompt("context_builder", label=context.chat_type)` 时根据 `chat_type` 切换远端 Langfuse prompt。`stream_chat` 里把 prompt 产出的文本和 `chat_history`/`trigger_content` 拼成单条 `HumanMessage`，因此所有上下文都被压垮进一条 message 中。

`ChatAgent` 使用 LangChain 的 `create_agent` 并接受 `messages` 列表输入，目前只有这一条压缩后的 `HumanMessage`。要做到“私聊不上下文压缩”，需要在 `chat_type == "p2p"` 时提供逐条消息的多轮对话（可利用 `QuickSearchResult.role` 区分 user/assistant），同时保留群聊现有压缩流程以继续服务 `context_builder` group prompt。

图片处理 `_extract_and_replace_images` 及 `image_client.process_image` 逻辑是通用的，可以在两种上下文路径里共享；`ContextSchema` 只包含 `curr_message_id` 与 `image_url_list`，因此私聊新增的多轮消息可以直接传给 agent 而无需调整 schema。
# 提议的解决方案
拆分上下文构建：群聊继续压缩为单条 message，沿用 Langfuse prompt；私聊保留 QuickSearchResult 多轮消息，逐条转换为 LangChain `HumanMessage`/`AIMessage` 并附带图片 URL blocks，共用图片下载逻辑。

# 当前执行步骤："5. 等待Review"

# 任务进度
[2025-11-21_19:07:12]
- 已修改：app/agents/main/context_builder.py app/agents/main/agent.py
- 更改：重构上下文构建拆分群聊与私聊路径，新增私聊多轮消息数据结构，并在主 agent 中按类型构造 LangChain 消息序列。
- 原因：满足私聊无需历史压缩、需要原生消息多模态输入的需求。
- 阻碍因素：`uv`/`ruff` 命令在当前环境不存在，已改用 IDE 诊断确认无 lint。
- 状态：成功

# 最终审查
