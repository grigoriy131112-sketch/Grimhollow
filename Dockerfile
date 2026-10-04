# Grimhollow — one image that runs the whole game.
# Node 24 is required: the server uses the built-in `node:sqlite` module.
FROM node:24-bookworm-slim AS build
WORKDIR /app

# Install with the workspace manifests first so layers cache on code changes.
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci

COPY . .
RUN npm run build

# --- runtime ---
FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001 \
    DB_PATH=/data/grimhollow.sqlite

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server ./server
COPY --from=build /app/client/dist ./client/dist

# The SQLite file lives on a volume so a container restart keeps the world.
RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/src/index.js"]
