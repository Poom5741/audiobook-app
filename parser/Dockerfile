FROM node:20-alpine

WORKDIR /app

# Copy package.json and package-lock.json
COPY parser/package.json ./
COPY parser/package-lock.json ./

# Install dependencies
RUN npm install --omit=dev && npm cache clean --force

# Copy the rest of the parser application files
COPY parser/ ./

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