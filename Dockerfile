# Dockerfile — Production Container for ĐỐNG LỬA V2
# Works on: Render, Koyeb, Hugging Face, Fly.io, Railway, Self-Host

# ---- Stage 1: Build ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy all workspace manifests first
COPY package*.json ./
COPY packages/shared-types/package*.json ./packages/shared-types/
COPY apps/api/package*.json ./apps/api/
COPY apps/web/package*.json ./apps/web/

# Install all dependencies (including devDependencies like typescript, vite, tailwind)
RUN npm install

# Copy all source files
COPY . .

# Build workspaces in proper dependency order
RUN npm run build --workspace=packages/shared-types
RUN npm run build --workspace=apps/api
RUN npm run build --workspace=apps/web

# ---- Stage 2: Runtime ----
FROM node:20-alpine AS runtime

WORKDIR /app

# Copy manifests
COPY package*.json ./
COPY packages/shared-types/package*.json ./packages/shared-types/
COPY apps/api/package*.json ./apps/api/
COPY apps/web/package*.json ./apps/web/

# Install only production dependencies
RUN npm install --omit=dev --workspace=apps/api

# Copy compiled backend & shared types
COPY --from=builder /app/packages/shared-types ./packages/shared-types
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/src/db/schema.sql ./apps/api/src/db/schema.sql
COPY --from=builder /app/apps/api/src/db/schema.sql ./apps/api/dist/db/schema.sql

# Copy built frontend (Express serves this statically as SPA)
COPY --from=builder /app/apps/web/dist ./apps/web/dist

# Persistent data directory for SQLite
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3001
ENV DATABASE_PATH=/app/data/dongluav2.db

EXPOSE 3001 10000 7860

WORKDIR /app/apps/api

CMD ["node", "--max-old-space-size=384", "dist/index.js"]
