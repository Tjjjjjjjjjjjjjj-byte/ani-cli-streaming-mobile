
FROM node:22-bookworm-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
COPY shared ./shared
RUN npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=3001 \
    DATA_DIR=/data

RUN apt-get update \
 && apt-get install -y --no-install-recommends bash curl ca-certificates git fzf ffmpeg aria2 openssl \
 && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o /usr/local/bin/yt-dlp \
 && chmod +x /usr/local/bin/yt-dlp
RUN git clone --depth 1 https://github.com/pystardust/ani-cli /tmp/ani-cli \
 && install -m 755 /tmp/ani-cli/ani-cli /usr/local/bin/ani-cli \
 && rm -rf /tmp/ani-cli

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY backend ./backend
COPY shared ./shared
COPY --from=web /app/dist ./dist

RUN sed -i 's/\r$//' backend/mpv-print && chmod +x backend/mpv-print \
 && mkdir -p /data && chown -R node:node /data /app

USER node
VOLUME /data
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://localhost:3001/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "backend/servers.js"]
