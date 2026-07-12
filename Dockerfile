FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate
COPY . .
EXPOSE 3000
ENV NODE_ENV=production
CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]
