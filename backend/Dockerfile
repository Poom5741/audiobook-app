FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev --prefer-offline && npm cache clean --force

# Copy application files
COPY . .

# Create logs directory
RUN mkdir -p logs

# Set permissions
RUN chown -R node:node /app

USER node

EXPOSE 5000

CMD ["node", "src/server.js"]