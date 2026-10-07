FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts index.html ./
COPY .railway/railway.ts ./.railway/railway.ts
COPY public ./public
COPY src ./src
COPY scripts ./scripts
COPY tests/web ./tests/web
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 PRAXANS_DB=/data/praxans.sqlite
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
RUN mkdir -p /data && chown -R node:node /data /app
# Railway volumes may arrive owned by root. A small entrypoint fixes only this volume's ownership.
COPY scripts/container-entrypoint.mjs ./container-entrypoint.mjs
EXPOSE 8080
ENTRYPOINT ["node", "container-entrypoint.mjs"]
CMD ["node", "dist/server/index.js", "--production"]
