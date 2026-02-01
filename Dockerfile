# Stage 1: Build
FROM node:20-slim AS build

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn --frozen-lockfile

COPY . .
RUN yarn build

# Stage 2: Production
FROM node:20-slim

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn --frozen-lockfile --production && yarn cache clean

COPY --from=build /app/dist ./dist
COPY server.js .
COPY docker-entrypoint.sh .
RUN chmod +x docker-entrypoint.sh

ENTRYPOINT [ "/app/docker-entrypoint.sh" ]

EXPOSE 3000

CMD ["node", "server.js"]
