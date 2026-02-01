FROM node:22-alpine AS builder

WORKDIR /repo

RUN npm config set registry https://registry.npmmirror.com

# 先复制工作区元数据，利用 Docker layer cache
COPY package.json ./
COPY apps/main-server/package.json ./apps/main-server/package.json
COPY packages/ts-shared/package.json ./packages/ts-shared/package.json
COPY packages/pixiv-client/package.json ./packages/pixiv-client/package.json
COPY packages/lark-utils/package.json ./packages/lark-utils/package.json

RUN npm install

COPY apps/main-server ./apps/main-server
COPY packages/ts-shared ./packages/ts-shared
COPY packages/pixiv-client ./packages/pixiv-client
COPY packages/lark-utils ./packages/lark-utils

# 先构建共享包
RUN npm run -w @inner/shared build
RUN npm run -w @inner/pixiv-client build
RUN npm run -w @inner/lark-utils build

# 再构建主服务
RUN npm run -w apps/main-server build

RUN npm prune --omit=dev

FROM node:22-alpine

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

RUN apk add --no-cache tzdata
ENV TZ=Asia/Shanghai

WORKDIR /usr/src/app

COPY --from=builder /repo/apps/main-server/dist ./dist
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/packages/ts-shared ./packages/ts-shared
COPY --from=builder /repo/packages/pixiv-client ./packages/pixiv-client
COPY --from=builder /repo/packages/lark-utils ./packages/lark-utils
COPY --from=builder /repo/apps/main-server/package.json ./package.json

RUN mkdir -p /var/log/main-server && \
    chmod 777 /var/log/main-server

CMD ["node", "dist/index.js"]
