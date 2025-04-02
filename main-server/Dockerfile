FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm config set registry https://registry.npmmirror.com

RUN npm ci

COPY . .

RUN npm run build

FROM node:20-alpine

WORKDIR /usr/src/app

COPY --from=builder /usr/src/app/dist ./dist

COPY --from=builder /usr/src/app/node_modules ./node_modules

COPY package*.json ./

# 创建日志目录
RUN mkdir -p /var/log/main-server && \
    chmod 777 /var/log/main-server

CMD ["node", "dist/index.js"]