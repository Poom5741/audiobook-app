#!/bin/bash

# Start centralized logging infrastructure for audiobook application
# This script starts ELK stack (Elasticsearch, Logstash, Kibana) and log shippers

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(dirname "$SCRIPT_DIR")

echo -e "${BLUE}🚀 Starting Audiobook Centralized Logging Infrastructure${NC}"

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running. Please start Docker first.${NC}"
    exit 1
fi

# Create logs directory if it doesn't exist
mkdir -p "$PROJECT_ROOT/logs"

# Create network if it doesn't exist
echo -e "${YELLOW}🔗 Creating audiobook network...${NC}"
docker network create audiobook-network 2>/dev/null || echo "Network already exists"

# Start logging services
echo -e "${YELLOW}📊 Starting Elasticsearch...${NC}"
docker-compose -f "$PROJECT_ROOT/docker-compose.logging.yml" up -d elasticsearch

# Wait for Elasticsearch to be ready
echo -e "${YELLOW}⏳ Waiting for Elasticsearch to be ready...${NC}"
timeout 120 bash -c 'until curl -f http://localhost:9200/_cluster/health; do sleep 5; done'

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Elasticsearch is ready${NC}"
else
    echo -e "${RED}❌ Elasticsearch failed to start within 2 minutes${NC}"
    exit 1
fi

# Start Logstash
echo -e "${YELLOW}🔄 Starting Logstash...${NC}"
docker-compose -f "$PROJECT_ROOT/docker-compose.logging.yml" up -d logstash

# Start Kibana
echo -e "${YELLOW}📊 Starting Kibana...${NC}"
docker-compose -f "$PROJECT_ROOT/docker-compose.logging.yml" up -d kibana

# Start log shippers
echo -e "${YELLOW}📦 Starting Filebeat...${NC}"
docker-compose -f "$PROJECT_ROOT/docker-compose.logging.yml" up -d filebeat

echo -e "${YELLOW}🌊 Starting Fluentd...${NC}"
docker-compose -f "$PROJECT_ROOT/docker-compose.logging.yml" up -d fluentd

# Wait for Kibana to be ready
echo -e "${YELLOW}⏳ Waiting for Kibana to be ready...${NC}"
timeout 120 bash -c 'until curl -f http://localhost:5601/api/status; do sleep 5; done'

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Kibana is ready${NC}"
else
    echo -e "${YELLOW}⚠️  Kibana might still be starting up${NC}"
fi

# Create index patterns and dashboards
echo -e "${YELLOW}🎨 Setting up Kibana index patterns...${NC}"
sleep 10  # Give services a moment to initialize

# Create audiobook index pattern
curl -X POST "localhost:5601/api/saved_objects/index-pattern/audiobook-*" \
  -H "Content-Type: application/json" \
  -H "kbn-xsrf: true" \
  -d '{
    "attributes": {
      "title": "audiobook-*",
      "timeFieldName": "@timestamp"
    }
  }' 2>/dev/null || echo "Index pattern might already exist"

echo ""
echo -e "${GREEN}🎉 Centralized Logging Infrastructure Started Successfully!${NC}"
echo ""
echo -e "${BLUE}📊 Access Points:${NC}"
echo -e "  • Elasticsearch: ${YELLOW}http://localhost:9200${NC}"
echo -e "  • Kibana:        ${YELLOW}http://localhost:5601${NC}"
echo -e "  • Logstash:      ${YELLOW}http://localhost:9600${NC}"
echo ""
echo -e "${BLUE}📋 Useful Commands:${NC}"
echo -e "  • View logs:     ${YELLOW}docker-compose -f docker-compose.logging.yml logs -f${NC}"
echo -e "  • Stop logging:  ${YELLOW}docker-compose -f docker-compose.logging.yml down${NC}"
echo -e "  • Restart:       ${YELLOW}./scripts/restart-logging.sh${NC}"
echo ""
echo -e "${BLUE}🔍 Log Sources:${NC}"
echo -e "  • Application logs: ${YELLOW}/logs/*-combined.log${NC}"
echo -e "  • Error logs:       ${YELLOW}/logs/*-error.log${NC}"
echo -e "  • Audit logs:       ${YELLOW}/logs/*-audit.log${NC}"
echo -e "  • Metrics logs:     ${YELLOW}/logs/*-metrics.log${NC}"
echo ""

# Show running containers
echo -e "${BLUE}🐳 Running Logging Containers:${NC}"
docker-compose -f "$PROJECT_ROOT/docker-compose.logging.yml" ps