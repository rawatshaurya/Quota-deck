FROM node:24-bookworm-slim AS test

WORKDIR /app
COPY package.json ./
COPY server.mjs start.mjs ./
COPY collector ./collector
COPY lib ./lib
COPY public ./public
COPY test ./test
RUN node --test test/*.test.mjs && touch /tmp/quota-deck-tests-passed

FROM node:24-bookworm-slim AS runtime

COPY --from=test /tmp/quota-deck-tests-passed /tmp/quota-deck-tests-passed

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4173 \
    DEMO_MODE=false \
    LOCAL_COLLECTORS=false \
    QUOTA_DECK_CONFIG=/data/config.json

WORKDIR /app
COPY package.json ./
COPY server.mjs start.mjs ./
COPY collector ./collector
COPY lib ./lib
COPY public ./public

RUN mkdir -p /data && chown node:node /data
USER node

VOLUME ["/data"]
EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4173/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "start.mjs"]
