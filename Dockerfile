FROM mcr.microsoft.com/playwright:v1.62.1-noble@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e AS base

WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

ARG ENGINE_VERSION=0.1.3
ARG VCS_REF=unknown
LABEL org.opencontainers.image.title="Prerender Buddy Engine" \
      org.opencontainers.image.description="Secure self-hosted crawler rendering engine" \
      org.opencontainers.image.source="https://github.com/kopachlager/prerenderbuddy-engine" \
      org.opencontainers.image.version="$ENGINE_VERSION" \
      org.opencontainers.image.revision="$VCS_REF" \
      org.opencontainers.image.licenses="Apache-2.0"

FROM base AS test

COPY package*.json ./
RUN npm ci --ignore-scripts
COPY src ./src
COPY test ./test

CMD ["npm", "run", "test:integration"]

FROM base AS runtime

ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force \
    && rm -rf /usr/lib/node_modules/npm /usr/lib/node_modules/yarn \
    && rm -f /usr/bin/npm /usr/bin/npx /usr/bin/yarn /usr/bin/yarnpkg

COPY --chown=pwuser:pwuser src ./src

USER pwuser
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
