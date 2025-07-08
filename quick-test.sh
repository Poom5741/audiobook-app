#!/bin/bash

# Quick test script - builds only essential services for faster testing
echo "🚀 Quick build test - only essential services"

# Build only lightweight services first
echo "Building backend..."
docker-compose build backend

echo "Building parser..."  
docker-compose build parser

echo "Building TTS API (lightweight)..."
docker-compose build tts-api

echo "✅ Core services built! To test frontend:"
echo "docker-compose build frontend"

echo "To run core services:"
echo "docker-compose up postgres redis backend parser tts-api"