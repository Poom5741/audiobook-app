FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY parser/package*.json ./

# Install dependencies
RUN npm ci --omit=dev --prefer-offline && npm cache clean --force

# Copy shared modules to /app/shared
RUN mkdir -p ./shared
COPY shared/ ./shared/
# Install shared module dependencies
WORKDIR ./shared
RUN npm install --production
WORKDIR /app

# Copy application files
COPY parser/ .

# Create necessary directories and set permissions
RUN mkdir -p output temp-uploads && \
    chown -R node:node /app

USER node

EXPOSE 3002

CMD ["node", "src/server.js"]