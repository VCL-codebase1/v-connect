FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY campaign-worker.mjs campaign-helpers.mjs prod-ca-2021.crt ./
USER node
CMD ["node", "campaign-worker.mjs"]
