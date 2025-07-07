#!/bin/bash

echo "🚀 Starting test environment for book download..."

# Create necessary directories
mkdir -p books audio

# Copy environment file
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ Created .env file"
fi

# Start only required services
echo "🐳 Starting Docker services (postgres, redis, crawler)..."
docker-compose -f docker-compose.dev.yml up -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check if services are running
echo "🔍 Checking service status..."
docker-compose -f docker-compose.dev.yml ps

# Show crawler logs
echo "📝 Crawler logs (last 20 lines):"
docker-compose -f docker-compose.dev.yml logs --tail=20 crawler

echo ""
echo "✅ Services should be running!"
echo ""
echo "📚 To test downloading a book:"
echo "1. Run: node crawler/test-api.js"
echo "2. Or use curl commands:"
echo ""
echo "Search for books:"
echo "curl 'http://localhost:3001/api/search?q=python+programming&limit=5'"
echo ""
echo "Download a book (replace URL with actual book URL):"
echo "curl -X POST http://localhost:3001/api/download \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"bookUrl\": \"https://annas-archive.org/md5/...\"}''"
echo ""
echo "Check download status:"
echo "curl http://localhost:3001/api/queue/status"
echo ""
echo "To stop services: docker-compose -f docker-compose.dev.yml down"