FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm install --workspace=@modeljudge/shared --workspace=@modeljudge/api || npm install
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @modeljudge/shared && npm run build -w @modeljudge/api

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["node", "dist/index.js"]
