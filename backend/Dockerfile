FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY frontend/ ./frontend/
COPY vite.config.ts tsconfig.json ./
COPY scripts/ ./scripts/
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
COPY --from=build /app/dist ./dist/
COPY backend/ ./backend/
ENV HOST=0.0.0.0 PORT=8787 NODE_ENV=production
EXPOSE 8787
USER node
CMD ["node", "backend/server.mjs"]
