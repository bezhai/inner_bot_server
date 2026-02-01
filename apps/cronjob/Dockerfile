FROM node:22.12.0

ENV TZ=Asia/Shanghai

WORKDIR /app

# 创建包含 cronjob 和所有依赖包的 workspace 配置
RUN echo '{"name":"cronjob-build","private":true,"workspaces":["apps/cronjob","packages/ts-shared","packages/lark-utils","packages/pixiv-client"]}' > package.json

# 复制所有依赖包
COPY packages/ts-shared ./packages/ts-shared
COPY packages/lark-utils ./packages/lark-utils
COPY packages/pixiv-client ./packages/pixiv-client

# 复制 cronjob 的 package.json
COPY apps/cronjob/package*.json ./apps/cronjob/

# 安装依赖（npm 会自动处理 workspace 链接）
RUN npm install

# 构建所有依赖包
RUN cd packages/ts-shared && npm run build
RUN cd packages/lark-utils && npm run build
RUN cd packages/pixiv-client && npm run build

# 复制 cronjob 源代码
COPY apps/cronjob/src ./apps/cronjob/src
COPY apps/cronjob/tsconfig.json ./apps/cronjob/

# 构建 cronjob
RUN cd apps/cronjob && npm run build

ENV NODE_ENV=production

WORKDIR /app/apps/cronjob

CMD ["node", "dist/index.js"]
