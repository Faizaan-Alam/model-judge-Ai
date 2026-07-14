FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/worker/package.json apps/worker/
RUN npm install --workspace=@modeljudge/shared --workspace=@modeljudge/worker || npm install
COPY packages/shared packages/shared
COPY apps/worker apps/worker
RUN npm run build -w @modeljudge/shared && npm run build -w @modeljudge/worker

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/worker
CMD ["node", "dist/index.js"]
