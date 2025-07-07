#!/bin/bash

# Docker run script for TTS API
# This script demonstrates how to run the TTS API with proper volume mounts

echo "🐳 Starting TTS API Docker Container..."

# Set variables
CONTAINER_NAME="audiobook-tts-api"
IMAGE_NAME="audiobook-tts"
AUDIO_PATH="$(pwd)/../audio"
HOST_PORT="8000"

# Create audio directory if it doesn't exist
mkdir -p "$AUDIO_PATH"

# Stop and remove existing container
if docker ps -a --format 'table {{.Names}}' | grep -q "$CONTAINER_NAME"; then
    echo "🛑 Stopping existing container..."
    docker stop "$CONTAINER_NAME"
    docker rm "$CONTAINER_NAME"
fi

# Build image if it doesn't exist
if ! docker images --format 'table {{.Repository}}' | grep -q "$IMAGE_NAME"; then
    echo "🔨 Building Docker image..."
    docker build -t "$IMAGE_NAME" .
fi

# Run container
echo "🚀 Starting TTS API container..."
docker run -d \
    --name "$CONTAINER_NAME" \
    -p "$HOST_PORT:8000" \
    -v "$AUDIO_PATH:/audio" \
    -e TTS_PORT=8000 \
    -e TTS_HOST=0.0.0.0 \
    -e AUDIO_PATH=/audio \
    -e LOG_LEVEL=INFO \
    --restart unless-stopped \
    "$IMAGE_NAME"

# Wait for container to start
echo "⏳ Waiting for container to start..."
sleep 5

# Check if container is running
if docker ps --format 'table {{.Names}}' | grep -q "$CONTAINER_NAME"; then
    echo "✅ TTS API container started successfully!"
    echo "📍 Available at: http://localhost:$HOST_PORT"
    echo "🏥 Health check: http://localhost:$HOST_PORT/health"
    echo "📚 API docs: http://localhost:$HOST_PORT/docs"
    echo ""
    echo "🔍 To view logs: docker logs -f $CONTAINER_NAME"
    echo "🛑 To stop: docker stop $CONTAINER_NAME"
    
    # Show initial logs
    echo ""
    echo "📝 Initial logs:"
    docker logs "$CONTAINER_NAME" --tail 10
else
    echo "❌ Failed to start container!"
    echo "📝 Logs:"
    docker logs "$CONTAINER_NAME"
fi