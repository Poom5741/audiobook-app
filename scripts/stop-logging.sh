#!/bin/bash

# Stop centralized logging infrastructure for audiobook application

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

echo -e "${BLUE}🛑 Stopping Audiobook Centralized Logging Infrastructure${NC}"

# Stop all logging services
echo -e "${YELLOW}📦 Stopping log shippers (Filebeat, Fluentd)...${NC}"
docker-compose -f "$PROJECT_ROOT/docker-compose.logging.yml" stop filebeat fluentd

echo -e "${YELLOW}📊 Stopping Kibana...${NC}"
docker-compose -f "$PROJECT_ROOT/docker-compose.logging.yml" stop kibana

echo -e "${YELLOW}🔄 Stopping Logstash...${NC}"
docker-compose -f "$PROJECT_ROOT/docker-compose.logging.yml" stop logstash

echo -e "${YELLOW}📊 Stopping Elasticsearch...${NC}"
docker-compose -f "$PROJECT_ROOT/docker-compose.logging.yml" stop elasticsearch

echo -e "${GREEN}✅ All logging services stopped${NC}"

# Option to remove containers and volumes
if [[ "$1" == "--remove" || "$1" == "-r" ]]; then
    echo -e "${YELLOW}🗑️  Removing logging containers and volumes...${NC}"
    docker-compose -f "$PROJECT_ROOT/docker-compose.logging.yml" down -v
    echo -e "${GREEN}✅ Logging containers and volumes removed${NC}"
else
    echo -e "${BLUE}💡 To remove containers and volumes, run: $0 --remove${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Logging infrastructure stopped successfully!${NC}"