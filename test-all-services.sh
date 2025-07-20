#!/bin/bash

set -e

echo "Starting all Docker services..."
docker-compose up -d --build

echo "Waiting for services to become healthy..."
docker-compose up --wait

echo "All services are up and healthy. Running tests..."

# Test PostgreSQL connection
echo "Testing PostgreSQL connection..."
docker-compose exec backend psql -h postgres -U audiobook_user -d audiobook_db -c "SELECT 1;" > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "PostgreSQL connection successful."
else
  echo "ERROR: PostgreSQL connection failed."
  docker-compose down
  exit 1
fi

# Test Redis connection
echo "Testing Redis connection..."
docker-compose exec backend redis-cli -h redis ping > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "Redis connection successful."
else
  echo "ERROR: Redis connection failed."
  docker-compose down
  exit 1
fi

# Test TTS API
echo "Testing TTS API..."
TTS_STATUS=$(docker-compose exec backend curl -s http://tts-api:8000/health)
if [ "$TTS_STATUS" == "OK" ]; then
  echo "TTS API is responsive."
else
  echo "ERROR: TTS API is not responsive. Status: $TTS_STATUS"
  docker-compose down
  exit 1
fi

# Test Backend API
echo "Testing Backend API..."
BACKEND_STATUS=$(curl -s http://localhost:5001/health)
if [ "$BACKEND_STATUS" == "OK" ]; then
  echo "Backend API is responsive."
else
  echo "ERROR: Backend API is not responsive. Status: $BACKEND_STATUS"
  docker-compose down
  exit 1
fi

# Test Frontend (via Nginx)
echo "Testing Frontend (via Nginx)..."
FRONTEND_STATUS=$(curl -s http://localhost:80)
if [[ "$FRONTEND_STATUS" == *"Audiobook App"* ]]; then # Assuming "Audiobook App" is in the frontend's index.html
  echo "Frontend is accessible and serving content."
else
  echo "ERROR: Frontend is not accessible or serving expected content."
  docker-compose down
  exit 1
fi

echo "All services passed end-to-end tests!"

echo "Bringing down Docker services..."
docker-compose down

echo "Test script finished."
