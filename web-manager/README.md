# Web Manager - AI提示词管理前端

这是一个基于React的前端应用，用于管理AI提示词。

## 技术栈

- React 18
- TypeScript
- Vite
- Tailwind CSS
- NextUI
- Jotai (状态管理)
- Lucide React (图标)

## 开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览构建结果
npm run preview
```

## Docker部署

这个应用已经配置好了Docker多阶段构建，可以通过docker-compose一键部署：

```bash
# 构建并启动所有服务
docker-compose up --build

# 仅启动web-manager服务
docker-compose up --build web-manager
```

部署后可以通过 http://localhost:3001 访问管理界面。

## API配置

应用会通过nginx代理将API请求转发到main-server服务（容器名：app）。
API请求路径为 `/api/prompts`，会被代理到 `http://app:3000/api/prompts`。

## 功能特性

- 提示词列表展示
- 提示词编辑功能
- 响应式设计
- 自动保存
- 错误处理和用户反馈

## 文件结构

```
web-manager/
├── components/          # React组件
│   ├── PromptList/     # 提示词列表组件
│   └── PromptEditModal/ # 编辑对话框组件
├── api/                # API请求封装
├── hooks/              # 自定义React Hooks
├── states/             # Jotai状态管理
├── types/              # TypeScript类型定义
├── App.tsx             # 主应用组件
├── entry.tsx           # 应用入口
├── entry.css           # 全局样式
└── index.html          # HTML模板
