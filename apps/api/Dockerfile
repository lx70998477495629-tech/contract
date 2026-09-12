FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY apps/api apps/api
COPY infra/postgres infra/postgres
RUN npm run build -w @heyue/api
RUN chown -R node:node /app
USER node
CMD ["sh","-c","npm run migrate -w @heyue/api && npm run start -w @heyue/api"]
