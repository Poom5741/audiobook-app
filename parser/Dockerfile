FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev --prefer-offline && npm cache clean --force

# Copy application files
COPY . .

# Create necessary directories and set permissions
RUN mkdir -p output temp-uploads && \
    chown -R node:node /app

USER node

EXPOSE 3002

CMD ["node", "src/server.js"]