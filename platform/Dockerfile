FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY web ./web
COPY scripts/seed.js scripts/make-admin.js ./scripts/
ENV NODE_ENV=production DATA_DIR=/data
VOLUME /data
EXPOSE 3000
CMD ["node", "--no-warnings", "server/index.js"]
