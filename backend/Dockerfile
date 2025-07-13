FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY backend/package*.json ./

# Install dependencies
RUN npm ci --omit=dev --prefer-offline && npm cache clean --force

# Copy shared modules to root level (3 levels up from /app/src/)
RUN mkdir -p /shared
COPY shared/ /shared/
# Install shared module dependencies
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