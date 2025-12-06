FROM node:22-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm config set registry https://registry.npmmirror.com

RUN npm ci

COPY . .

RUN npm run build

RUN npm prune --omit=dev

FROM node:22-alpine

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

RUN apk add --no-cache tzdata
ENV TZ=Asia/Shanghai

WORKDIR /usr/src/app

COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY package*.json ./

RUN mkdir -p /var/log/main-server && \
    chmod 777 /var/log/main-server

CMD ["node", "dist/index.js"]