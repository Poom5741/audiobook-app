# Multi-stage build for better caching and smaller images
FROM node:20-alpine AS base

# Install Chrome dependencies for Alpine
RUN apk add --no-cache     chromium     nss     freetype     freetype-dev     harfbuzz     ca-certificates     ttf-freefont     curl     && rm -rf /var/cache/apk/*

# Set Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Dependencies stage
FROM base AS deps
WORKDIR /app
COPY crawler/package*.json ./
RUN npm ci --omit=dev --prefer-offline && npm cache clean --force

# Production stage
FROM base AS runner
WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy shared modules
COPY shared /shared
WORKDIR /shared
RUN npm install --production
WORKDIR /app

# Copy application files
COPY crawler/ .

# Add user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 -G nodejs

# Create books directory and temp-uploads directory
RUN mkdir -p /books temp-uploads && \
    chown -R nextjs:nodejs /app /books temp-uploads



USER nextjs

EXPOSE 3001

CMD ["node", "src/index.js"]