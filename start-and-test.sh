#!/bin/bash

# Start Audiobook System and Run Comprehensive Tests

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Main execution
main() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Audiobook System Start & Test Suite  ${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    
    log "Starting audiobook system with Docker Compose..."
    
    # Stop any existing containers
    log "Stopping existing containers..."
    docker-compose down --remove-orphans 2>/dev/null || true
    
    # Clean up any orphaned volumes if needed
    if [ "$1" = "--clean" ]; then
        warning "Cleaning up volumes and data..."
        docker-compose down -v
        docker system prune -f
    fi
    
    # Start the system
    log "Starting all services..."
    docker-compose up -d --build
    
    if [ $? -eq 0 ]; then
        success "Docker Compose started successfully"
    else
        error "Failed to start Docker Compose"
        exit 1
    fi
    
    # Wait a bit for services to initialize
    log "Waiting for services to initialize..."
    sleep 15
    
    # Show running containers
    echo ""
    log "Running containers:"
    docker-compose ps
    echo ""
    
    # Run the comprehensive test
    log "Running comprehensive audiobook pipeline test..."
    echo ""
    
    if [ -x "./test-full-pipeline.sh" ]; then
        ./test-full-pipeline.sh
        test_result=$?
    else
        error "Test script not found or not executable"
        exit 1
    fi
    
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}            FINAL RESULTS               ${NC}"
    echo -e "${BLUE}========================================${NC}"
    
    if [ $test_result -eq 0 ]; then
        success "🎉 SYSTEM IS FULLY FUNCTIONAL!"
        echo ""
        echo "Your audiobook system is ready for use:"
        echo "  📱 Frontend: http://localhost:3000"
        echo "  🔌 Backend API: http://localhost:5001"
        echo "  🕷️ Crawler: http://localhost:3001"
        echo "  🎤 TTS Service: http://localhost:8000"
        echo "  🗄️ Database: localhost:5432"
        echo "  💾 Redis: localhost:6379"
        echo ""
        echo "To stop the system: docker-compose down"
        echo "To view logs: docker-compose logs [service-name]"
        echo ""
        echo -e "${GREEN}✅ Ready to create audiobooks!${NC}"
    else
        error "❌ SYSTEM HAS ISSUES - CHECK LOGS"
        echo ""
        echo "Troubleshooting commands:"
        echo "  docker-compose logs backend"
        echo "  docker-compose logs frontend"
        echo "  docker-compose logs crawler"
        echo "  docker-compose logs tts-api"
        echo "  docker-compose logs postgres"
        echo "  docker-compose logs redis"
        echo ""
        echo "To restart a service:"
        echo "  docker-compose restart [service-name]"
        echo ""
        echo "To rebuild and restart everything:"
        echo "  docker-compose down && docker-compose up -d --build"
    fi
    
    exit $test_result
}

# Handle script interruption
trap 'echo -e "\n${YELLOW}Startup interrupted by user${NC}"; exit 1' INT

# Show usage
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --clean    Clean up volumes and data before starting"
    echo "  --help     Show this help message"
    echo ""
    echo "This script will:"
    echo "  1. Stop any existing containers"
    echo "  2. Start all audiobook services with Docker Compose"
    echo "  3. Wait for services to initialize"
    echo "  4. Run comprehensive pipeline tests"
    echo "  5. Report final system status"
    exit 0
fi

# Run main function
main "$@"