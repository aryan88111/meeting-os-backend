# Stage 1: Build Application
FROM node:22-alpine AS builder

WORKDIR /app

# Install OpenSSL for Prisma engine compatibility
RUN apk add --no-cache openssl

# Copy package definitions and prisma schema
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies and generate Prisma client
RUN npm ci
RUN npx prisma generate --schema=./prisma/schema.prisma

# Copy application source code
COPY . .

# Build NestJS application
RUN npm run build

# Stage 2: Production Runtime
FROM node:22-alpine AS runner

WORKDIR /app

# Install OpenSSL in production runtime
RUN apk add --no-cache openssl

ENV NODE_ENV=production
ENV PORT=8000

# Copy package definitions
COPY package*.json ./
COPY prisma ./prisma/

# Install production dependencies only
RUN npm ci --omit=dev

# Copy generated Prisma client and compiled build from builder stage
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/dist ./dist

# Use non-root user for security
USER node

EXPOSE 8000

CMD ["node", "dist/main.js"]
