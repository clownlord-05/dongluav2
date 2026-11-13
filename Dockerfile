# Dockerfile — Universal Production Container for ĐỐNG LỬA V2
# Supports: Render, Koyeb, Hugging Face Spaces, Fly.io, Railway, Self-Host

# ---- Stage 1: Build ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root & workspaces manifests
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY apps/web/package*.json ./apps/web/

# Install all dependencies for build
RUN npm install

# Copy entire source
COPY . .

# Build both API and Web
RUN npm --prefix apps/api run build
RUN npm --prefix apps/web run build

# ---- Stage 2: Runtime ----
FROM node:20-alpine AS runtime

WORKDIR /app

# Copy manifests
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY apps/web/package*.json ./apps/web/

# Install only production dependencies for API
RUN npm install --omit=dev

# Copy compiled backend
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/src/db/schema.sql ./apps/api/src/db/schema.sql

# Copy compiled frontend (Express serves this statically)
COPY --from=builder /app/apps/web/dist ./apps/web/dist

# Create persistent data directory for SQLite database
RUN mkdir -p /app/data

# Default environment variables
ENV NODE_ENV=production
ENV PORT=3001
ENV DATABASE_PATH=/app/data/dongluav2.db

# Expose standard ports (Render uses $PORT, HuggingFace uses 7860, default 3001)
EXPOSE 3001 7860 10000

WORKDIR /app/apps/api

# Run backend (which serves both REST API, Socket.IO WebSockets, and Web SPA)
CMD ["node", "--max-old-space-size=384", "dist/index.js"]
