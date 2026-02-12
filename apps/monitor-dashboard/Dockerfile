# Stage 1: Build frontend
FROM node:22-alpine AS frontend-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Stage 2: Build server
FROM node:22-alpine AS server-build
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY tsconfig.server.json ./
COPY server/ ./server/
RUN npx tsc -p tsconfig.server.json

# Stage 3: Production
FROM node:22-alpine
WORKDIR /app
COPY --from=server-build /app/node_modules ./node_modules
COPY --from=server-build /app/dist-server ./dist-server
COPY --from=frontend-build /app/client/dist ./client/dist
CMD ["node", "dist-server/index.js"]
