FROM node:22.12.0

ENV TZ=Asia/Shanghai

WORKDIR /app

# 复制根目录的 package.json 和 package-lock.json（包含 workspaces 配置）
COPY package*.json ./

# 复制 ts-shared 包
COPY packages/ts-shared ./packages/ts-shared

# 复制 cronjob 的 package.json
COPY apps/cronjob/package*.json ./apps/cronjob/

# 安装依赖（npm 会自动处理 workspace 链接）
RUN npm install

# 构建 ts-shared
RUN cd packages/ts-shared && npm run build

# 复制 cronjob 源代码
COPY apps/cronjob/src ./apps/cronjob/src
COPY apps/cronjob/tsconfig.json ./apps/cronjob/

# 构建 cronjob
RUN cd apps/cronjob && npm run build

ENV NODE_ENV=production

WORKDIR /app/apps/cronjob

CMD ["node", "dist/index.js"]
