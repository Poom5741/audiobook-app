FROM node:18-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Create necessary directories
RUN mkdir -p output temp-uploads

# Set permissions
RUN chown -R node:node /app

USER node

EXPOSE 3002

CMD ["node", "src/server.js"]