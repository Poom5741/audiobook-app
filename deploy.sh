#!/bin/bash

# Audiobook System Deployment Script
# 
# This script builds and deploys the complete audiobook system:
# - Frontend (Next.js)
# - Backend (Express.js)
# - TTS API (EmotiVoice)
# - Crawler & Parser (Node.js)
# - Database (PostgreSQL)
# - Cache (Redis)
# - Proxy (Nginx)

set -e

echo "🎧 Deploying Audiobook System..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running. Please start Docker first.${NC}"
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ docker-compose not found. Please install docker-compose.${NC}"
    exit 1
fi

echo -e "${BLUE}🐳 Docker environment ready${NC}"

# Create necessary directories
echo -e "${YELLOW}📁 Creating directories...${NC}"
mkdir -p ./nginx
mkdir -p ./database

# Build and start services
echo -e "${YELLOW}🏗️ Building and starting services...${NC}"
docker-compose -f docker-compose.prod.yml down --remove-orphans
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d

echo -e "${YELLOW}⏳ Waiting for services to start...${NC}"
sleep 30

# Check service health
echo -e "${YELLOW}🔍 Checking service health...${NC}"

services=("postgres:5432" "redis:6379" "backend:5001" "tts-api:8000" "frontend:3000")
all_healthy=true

for service in "${services[@]}"; do
    container_name="audiobook-${service%%:*}"
    port="${service#*:}"
    
    if docker exec "$container_name" nc -z localhost "$port" 2>/dev/null; then
        echo -e "${GREEN}✅ $container_name is healthy${NC}"
    else
        echo -e "${RED}❌ $container_name is not responding${NC}"
        all_healthy=false
    fi
done

# Test API endpoints
echo -e "${YELLOW}🧪 Testing API endpoints...${NC}"

# Test backend
if curl -f http://localhost:5001/api/books > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend API is responding${NC}"
else
    echo -e "${RED}❌ Backend API is not responding${NC}"
    all_healthy=false
fi

# Test TTS API
if curl -f http://localhost:8000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ TTS API is responding${NC}"
else
    echo -e "${RED}❌ TTS API is not responding${NC}"
    all_healthy=false
fi

# Test frontend
if curl -f http://localhost:3000 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Frontend is responding${NC}"
else
    echo -e "${RED}❌ Frontend is not responding${NC}"
    all_healthy=false
fi

# Test nginx proxy
if curl -f http://localhost:80 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Nginx proxy is responding${NC}"
else
    echo -e "${YELLOW}⚠️ Nginx proxy is not responding (this is optional)${NC}"
fi

echo ""
echo "🎯 Deployment Summary:"
echo "========================"

if [ "$all_healthy" = true ]; then
    echo -e "${GREEN}✅ All core services are running successfully!${NC}"
    echo ""
    echo "🌐 Access your audiobook system:"
    echo -e "   Frontend:  ${BLUE}http://localhost:3000${NC}"
    echo -e "   Backend:   ${BLUE}http://localhost:5001${NC}"
    echo -e "   TTS API:   ${BLUE}http://localhost:8000${NC}"
    echo -e "   Nginx:     ${BLUE}http://localhost:80${NC} (if configured)"
    echo ""
    echo "📚 Next steps:"
    echo "   1. Upload books via crawler service"
    echo "   2. Parse books to extract text"
    echo "   3. Generate audio with TTS API"
    echo "   4. Enjoy your audiobooks! 🎧"
    echo ""
    echo "📊 Monitor services:"
    echo "   docker-compose -f docker-compose.prod.yml logs -f"
    echo ""
    echo "🛑 Stop services:"
    echo "   docker-compose -f docker-compose.prod.yml down"
else
    echo -e "${RED}❌ Some services failed to start properly${NC}"
    echo ""
    echo "🔧 Troubleshooting:"
    echo "   1. Check logs: docker-compose -f docker-compose.prod.yml logs"
    echo "   2. Check service status: docker ps"
    echo "   3. Restart failed services: docker-compose -f docker-compose.prod.yml restart <service>"
    echo ""
    exit 1
fi

echo ""
echo -e "${GREEN}🎉 Audiobook System deployed successfully!${NC}"