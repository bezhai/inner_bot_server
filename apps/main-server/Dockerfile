FROM node:22-alpine AS builder

WORKDIR /repo

RUN npm config set registry https://registry.npmmirror.com

# 先复制工作区元数据，利用 Docker layer cache
COPY package.json ./
COPY apps/main-server/package.json ./apps/main-server/package.json
COPY packages/ts-common/package.json ./packages/ts-common/package.json

RUN npm install

COPY apps/main-server ./apps/main-server
COPY packages/ts-common ./packages/ts-common
RUN npm run -w apps/main-server build

RUN npm prune --omit=dev

FROM node:22-alpine

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

RUN apk add --no-cache tzdata
ENV TZ=Asia/Shanghai

WORKDIR /usr/src/app

COPY --from=builder /repo/apps/main-server/dist ./dist
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/packages/ts-common ./packages/ts-common
COPY --from=builder /repo/apps/main-server/package.json ./package.json

RUN mkdir -p /var/log/main-server && \
    chmod 777 /var/log/main-server

CMD ["node", "dist/index.js"]
