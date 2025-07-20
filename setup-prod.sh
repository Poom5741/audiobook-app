#!/bin/bash

# Production Setup Script for Audiobook System
# Sets up and deploys the application in a production environment

set -e

echo "🚀 Audiobook System - Production Setup"
echo "======================================"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
print_status "Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

print_success "Prerequisites check passed."

# Load and validate production environment variables
print_status "Loading production environment..."

if [ -f .env.production ]; then
    # Create a backup of current .env if it exists
    if [ -f .env ]; then
        cp .env .env.backup
        print_warning "Backed up existing .env to .env.backup"
    fi
    
    # Copy production config
    cp .env.production .env
    print_success "Production environment loaded."
else
    print_error ".env.production not found! Please create and configure it."
    exit 1
fi

# Generate secrets if they don't exist
print_status "Checking production secrets..."

if [ ! -d "scripts/secrets" ]; then
    print_status "Generating production secrets..."
    mkdir -p scripts/secrets
    
    # Generate JWT secret
    openssl rand -base64 32 > scripts/secrets/jwt_secret
    
    # Generate database password
    openssl rand -base64 16 > scripts/secrets/postgres_password
    
    # Generate Redis password
    openssl rand -base64 16 > scripts/secrets/redis_password
    
    print_success "Production secrets generated in scripts/secrets/"
    print_warning "Please store these secrets securely and update your environment accordingly."
fi

# SSL Certificate setup
print_status "Checking SSL certificates..."

if [ ! -d "nginx/ssl" ]; then
    print_warning "SSL certificates not found. Generating self-signed certificates for testing..."
    mkdir -p nginx/ssl
    
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout nginx/ssl/key.pem \
        -out nginx/ssl/cert.pem \
        -subj "/C=US/ST=State/L=City/O=Organization/OU=OrgUnit/CN=localhost"
    
    print_warning "Self-signed certificates generated. Replace with proper SSL certificates for production."
fi

# Database initialization
print_status "Preparing database..."

if [ -f "database/init.sql" ]; then
    print_success "Database initialization script found."
else
    print_error "Database initialization script not found!"
    exit 1
fi

# Build production images
print_status "Building production Docker images..."

docker-compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache

if [ $? -eq 0 ]; then
    print_success "Docker images built successfully."
else
    print_error "Failed to build Docker images."
    exit 1
fi

# Start production services
print_status "Starting production services..."

docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

if [ $? -eq 0 ]; then
    print_success "Production services started successfully."
else
    print_error "Failed to start production services."
    exit 1
fi

# Wait for services to be ready
print_status "Waiting for services to become healthy..."
sleep 30

# Health check
print_status "Performing health checks..."

# Check if all containers are running
CONTAINERS=$(docker-compose -f docker-compose.yml -f docker-compose.prod.yml ps -q)
RUNNING_CONTAINERS=$(docker inspect $CONTAINERS | grep '"Status": "running"' | wc -l)
TOTAL_CONTAINERS=$(echo $CONTAINERS | wc -w)

if [ "$RUNNING_CONTAINERS" -eq "$TOTAL_CONTAINERS" ]; then
    print_success "All $TOTAL_CONTAINERS containers are running."
else
    print_warning "$RUNNING_CONTAINERS/$TOTAL_CONTAINERS containers are running."
fi

# Test key endpoints
print_status "Testing production endpoints..."

# Test database connection
if docker-compose -f docker-compose.yml -f docker-compose.prod.yml exec -T postgres pg_isready -U audiobook_prod > /dev/null 2>&1; then
    print_success "Database connection: OK"
else
    print_error "Database connection: FAILED"
fi

# Test Redis connection
if docker-compose -f docker-compose.yml -f docker-compose.prod.yml exec -T redis redis-cli ping > /dev/null 2>&1; then
    print_success "Redis connection: OK"
else
    print_error "Redis connection: FAILED"
fi

# Test backend API (with timeout)
if timeout 10 curl -f -s http://localhost:5001/health > /dev/null 2>&1; then
    print_success "Backend API: OK"
else
    print_warning "Backend API: Not responding (may still be starting)"
fi

# Display final status
echo ""
echo "🎉 Production deployment completed!"
echo "=================================="
echo ""
print_success "Services Status:"
docker-compose -f docker-compose.yml -f docker-compose.prod.yml ps

echo ""
print_success "Access URLs:"
echo "  Frontend: https://localhost (or your configured domain)"
echo "  Backend API: https://localhost:5001"
echo "  TTS API: http://localhost:8000"

echo ""
print_success "Management Commands:"
echo "  View logs: docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f"
echo "  Stop services: docker-compose -f docker-compose.yml -f docker-compose.prod.yml down"
echo "  Restart services: docker-compose -f docker-compose.yml -f docker-compose.prod.yml restart"

echo ""
print_warning "Important Notes:"
echo "  - Monitor logs for any errors: docker-compose logs -f"
echo "  - Set up proper SSL certificates for production"
echo "  - Configure backup strategies for database and files"
echo "  - Set up monitoring and alerting"
echo "  - Review and update security settings"

echo ""
print_success "Production setup complete! 🚀"
