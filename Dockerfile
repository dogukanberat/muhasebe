# syntax=docker/dockerfile:1

### Base dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

### Build frontend (Vite)
FROM deps AS build
WORKDIR /app
COPY . .
# API adresini build zamanında ver; compose ile override edilecek.
# Tek container senaryosunda aynı origin çağrısı için boş bırakabilirsiniz ("/api" path'i kullanılır).
ARG VITE_API_URL=
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

### Backend runtime image
FROM node:20-alpine AS api
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY server.js ./server.js
COPY tcmb-cache.json ./tcmb-cache.json
EXPOSE 3001
CMD ["node", "server.js"]

### Frontend runtime image (static, Nginx)
FROM nginx:alpine AS web
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

### Full app (API + statik UI) in one container
FROM node:20-alpine AS app
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY server.js ./server.js
COPY --from=build /app/dist ./dist
COPY tcmb-cache.json ./tcmb-cache.json
EXPOSE 3001
CMD ["node", "server.js"]
