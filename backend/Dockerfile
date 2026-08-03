# PramaanSetu backend — includes FFmpeg for video/audio fingerprinting.
FROM node:20-bookworm-slim

# FFmpeg powers video frame extraction and audio decoding/fingerprinting.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps (dev deps needed to compile TypeScript), build, then prune.
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=4000
# FFmpeg is on PATH inside the image.
ENV FFMPEG_PATH=ffmpeg

EXPOSE 4000
CMD ["node", "dist/index.js"]
