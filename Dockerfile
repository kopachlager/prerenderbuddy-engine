FROM mcr.microsoft.com/playwright:v1.62.1-noble AS base

WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

FROM base AS test

COPY package*.json ./
RUN npm ci --ignore-scripts
COPY src ./src
COPY test ./test

CMD ["npm", "run", "test:integration"]

FROM base AS runtime

ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --chown=pwuser:pwuser src ./src

USER pwuser
EXPOSE 3000

CMD ["npm", "start"]
