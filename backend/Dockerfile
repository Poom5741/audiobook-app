FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY backend/package*.json ./

# Install dependencies
RUN npm ci --omit=dev --prefer-offline && npm cache clean --force

# Copy shared modules
COPY shared /shared
WORKDIR /shared
RUN npm install --production
WORKDIR /app

# Copy application files
COPY backend/ .

# Create logs directory
RUN mkdir -p logs

# Set permissions
RUN chown -R node:node /app

USER node

EXPOSE 5000

CMD ["node", "src/server.js"]