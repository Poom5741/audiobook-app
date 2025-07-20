#!/bin/bash

# This script verifies the deployment health of all services.

# Exit immediately if a command exits with a non-zero status.
set -e

echo "Starting deployment verification..."

# --- Configuration ---
# Load production environment variables
if [ -f .env.production ]; then
    export $(cat .env.production | grep -v '#' | awk '/=/ {print $1}')
    echo ".env.production loaded."
else
    echo "Error: .env.production not found! Please ensure it exists and is configured."
    exit 1
fi

# Define service URLs based on .env.production (adjust if health endpoints differ)
BACKEND_URL="http://localhost:${PORT:-3000}"
AUTH_URL="http://localhost:${AUTH_PORT:-3001}"
CRAWLER_URL="http://localhost:${CRAWLER_PORT:-3002}"
SUMMARIZER_URL="http://localhost:${SUMMARIZER_PORT:-3003}"
TTS_API_URL="http://localhost:${TTS_API_PORT:-3004}"
PARSER_URL="http://localhost:${PARSER_PORT:-3005}"
FRONTEND_URL="${NEXT_PUBLIC_API_BASE_URL:-http://localhost:3000}" # Note: This might conflict with backend if both use port 3000.

# --- Helper Functions ---
check_service() {
    local name=$1
    local url=$2
    echo "Checking $name at $url..."
    if curl --output /dev/null --silent --head --fail "$url"; then
        echo "$name is UP."
    else
        echo "Error: $name is DOWN or not reachable at $url."
        exit 1
    fi
}

run_tests() {
    local service_dir=$1
    echo "Running tests for $service_dir..."
    if [ -d "$service_dir" ]; then
        (cd "$service_dir" && npm test)
        echo "Tests for $service_dir passed."
    else
        echo "Warning: $service_dir directory not found. Skipping tests."
    fi
}

# --- Database Checks ---
echo "\n--- Database Checks ---"

# Backend Database Check
echo "Checking Backend Database: ${DATABASE_URL}"
if pg_isready -d "${DATABASE_URL}" -t 1; then
    echo "Backend Database is ready."
else
    echo "Error: Backend Database is not ready or connection failed."
    exit 1
fi

# Auth Database Check
echo "Checking Auth Database: ${AUTH_DATABASE_URL}"
if pg_isready -d "${AUTH_DATABASE_URL}" -t 1; then
    echo "Auth Database is ready."
else
    echo "Error: Auth Database is not ready or connection failed."
    exit 1
fi

# --- API Endpoint Checks ---
echo "\n--- API Endpoint Checks ---"
check_service "Backend Service" "$BACKEND_URL"
check_service "Auth Service" "$AUTH_URL"
check_service "Crawler Service" "$CRAWLER_URL"
check_service "Summarizer Service" "$SUMMARIZER_URL"
check_service "TTS API Service" "$TTS_API_URL"
check_service "Parser Service" "$PARSER_URL"
check_service "Frontend Service" "$FRONTEND_URL"

# --- File System Verification ---
echo "\n--- File System Verification ---"

# Check for existence of key directories
if [ -d "./audio" ]; then
    echo "'audio/' directory exists."
else
    echo "Warning: 'audio/' directory not found. This might be expected if no audio has been processed yet."
fi

if [ -d "./books" ]; then
    echo "'books/' directory exists."
else
    echo "Warning: 'books/' directory not found. This might be expected if no books have been processed yet."
fi

# Check for write permissions in temp-uploads (if applicable)
if [ -d "./backend/temp-uploads" ]; then
    if [ -w "./backend/temp-uploads" ]; then
        echo "'backend/temp-uploads' directory is writable."
    else
        echo "Error: 'backend/temp-uploads' directory is not writable."
        exit 1
    fi
else
    echo "Warning: 'backend/temp-uploads' directory not found. Skipping writability check."
fi

if [ -d "./crawler/temp-uploads" ]; then
    if [ -w "./crawler/temp-uploads" ]; then
        echo "'crawler/temp-uploads' directory is writable."
    else
        echo "Error: 'crawler/temp-uploads' directory is not writable."
        exit 1
    fi
else
    echo "Warning: 'crawler/temp-uploads' directory not found. Skipping writability check."
fi

# --- Run Tests ---
echo "\n--- Running Service Tests ---"
run_tests "auth"
run_tests "backend"
run_tests "crawler"
run_tests "frontend"
# Add other service tests here if they have dedicated test suites

echo "\nDeployment verification completed successfully. All checks passed."
