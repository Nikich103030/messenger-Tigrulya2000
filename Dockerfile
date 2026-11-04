FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY public ./public

RUN mkdir -p /data && chown node:node /data

ENV PORT=3000
ENV DB_FILE=/data/chat.db
EXPOSE 3000

USER node

CMD ["npm", "start"]
