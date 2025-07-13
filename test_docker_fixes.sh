#!/bin/bash

set -e

echo "--- Starting Docker Fixes Test ---"

# --- Task 1: Test Backend Shared Module Fix ---
echo "\n--- Building Backend Docker Image ---"
docker build -t audiobook-backend-test -f backend/Dockerfile .

echo "--- Running Backend Container to Verify Shared Modules ---"
CONTAINER_ID=$(docker run --rm -d --name backend-test audiobook-backend-test)
sleep 10 # Give container more time to start

echo "--- Checking Backend Logs for Shared Module Errors ---"
if docker logs $CONTAINER_ID 2>&1 | grep -q "MODULE_NOT_FOUND shared"; then
    echo "Backend: Shared module error found! Fix failed."
else
    echo "Backend: Shared module fix successful!"
fi

docker stop $CONTAINER_ID || true # Stop container, ignore if already stopped
docker wait $CONTAINER_ID || true # Wait for container to stop, ignore if already stopped

# --- Task 1: Test Crawler Shared Module Fix ---
echo "\n--- Building Crawler Docker Image ---"
docker build -t audiobook-crawler-test -f crawler/Dockerfile .

echo "--- Running Crawler Container to Verify Shared Modules ---"
CONTAINER_ID=$(docker run --rm -d --name crawler-test audiobook-crawler-test)
sleep 10 # Give container more time to start

echo "--- Checking Crawler Logs for Shared Module Errors ---"
if docker logs $CONTAINER_ID 2>&1 | grep -q "MODULE_NOT_FOUND shared"; then
    echo "Crawler: Shared module error found! Fix failed."
else
    echo "Crawler: Shared module fix successful!"
fi

docker stop $CONTAINER_ID || true # Stop container, ignore if already stopped
docker wait $CONTAINER_ID || true # Wait for container to stop, ignore if already stopped

# --- Task 1: Test Parser Shared Module Fix ---
echo "\n--- Building Parser Docker Image ---"
docker build -t audiobook-parser-test -f parser/Dockerfile .

echo "--- Running Parser Container to Verify Shared Modules ---"
CONTAINER_ID=$(docker run --rm -d --name parser-test audiobook-parser-test)
sleep 10 # Give container more time to start

echo "--- Checking Parser Logs for Shared Module Errors ---"
if docker logs $CONTAINER_ID 2>&1 | grep -q "MODULE_NOT_FOUND shared"; then
    echo "Parser: Shared module error found! Fix failed."
else
    echo "Parser: Shared module fix successful!"
fi

docker stop $CONTAINER_ID || true # Stop container, ignore if already stopped
docker wait $CONTAINER_ID || true # Wait for container to stop, ignore if already stopped

# --- Task 2: Test Frontend Build Context Fix ---
echo "\n--- Building Frontend Docker Image ---"
docker build -t audiobook-frontend-test -f frontend/Dockerfile ./frontend

echo "--- Running Frontend Container to Verify App Identity ---"
CONTAINER_ID=$(docker run --rm -d --name frontend-test -p 3000:3000 audiobook-frontend-test)
sleep 15 # Give Next.js app more time to start

echo "--- Verifying Frontend App Content (expecting 'audiobook-frontend' in package.json) ---"
# Access the running container's package.json to verify its content
if docker exec $CONTAINER_ID cat package.json | grep -q "audiobook-frontend"; then
    echo "Frontend: App identity verified (audiobook-frontend)!"
else
    echo "Frontend: Incorrect app identity! Fix failed."
fi

docker stop $CONTAINER_ID || true # Stop container, ignore if already stopped
docker wait $CONTAINER_ID || true # Wait for container to stop, ignore if already stopped

echo "\n--- All Docker Fixes Test Completed ---"
