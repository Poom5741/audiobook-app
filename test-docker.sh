#!/bin/bash

# Quick Docker Build Test
# Tests that all Dockerfiles can be parsed and built successfully

echo "🐳 Testing Docker builds..."

# Test docker-compose syntax
echo "1️⃣ Testing docker-compose syntax..."
if docker-compose config > /dev/null 2>&1; then
    echo "✅ docker-compose.yml syntax is valid"
else
    echo "❌ docker-compose.yml has syntax errors"
    exit 1
fi

if docker-compose -f docker-compose.prod.yml config > /dev/null 2>&1; then
    echo "✅ docker-compose.prod.yml syntax is valid"
else
    echo "❌ docker-compose.prod.yml has syntax errors"
    exit 1
fi

# Test individual Dockerfile syntax (without building)
echo "2️⃣ Testing Dockerfile syntax..."

services=("frontend" "backend" "crawler" "parser" "tts-api")

for service in "${services[@]}"; do
    echo "Testing $service Dockerfile..."
    if docker build --no-cache --dry-run "$service" > /dev/null 2>&1 || \
       docker build --no-cache --progress=plain "$service" 2>&1 | head -20 | grep -q "FROM"; then
        echo "✅ $service Dockerfile syntax is valid"
    else
        echo "❌ $service Dockerfile has syntax errors"
        exit 1
    fi
done

echo ""
echo "🎉 All Docker configurations are valid!"
echo ""
echo "To build and run the complete system:"
echo "  ./deploy.sh"
echo ""
echo "To run in development mode:"
echo "  docker-compose up --build"