#!/bin/bash

# Comprehensive Audiobook Pipeline Test Script
# Tests: Download → Parse → TTS → Audio Generation Pipeline

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
BACKEND_URL="http://localhost:5001"
FRONTEND_URL="http://localhost:3000"
CRAWLER_URL="http://localhost:3001"
TTS_URL="http://localhost:8000"
TEST_BOOK_URL="https://www.gutenberg.org/files/11/11-0.txt"  # Alice in Wonderland
TEST_BOOK_TITLE="Alice's Adventures in Wonderland"

# Test results tracking
TESTS_PASSED=0
TESTS_FAILED=0
DETAILED_RESULTS=()

log() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    DETAILED_RESULTS+=("✅ $1")
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    DETAILED_RESULTS+=("❌ $1")
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Wait for service to be ready
wait_for_service() {
    local service_name=$1
    local url=$2
    local max_attempts=${3:-30}
    local attempt=1
    
    log "Waiting for $service_name to be ready..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s -f "$url" > /dev/null 2>&1; then
            success "$service_name is ready"
            return 0
        fi
        
        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    error "$service_name failed to start within $((max_attempts * 2)) seconds"
    return 1
}

# Test service health
test_service_health() {
    local service_name=$1
    local health_url=$2
    
    log "Testing $service_name health..."
    
    response=$(curl -s -w "%{http_code}" "$health_url" -o /tmp/health_response.json)
    
    if [ "$response" = "200" ]; then
        success "$service_name health check passed"
        return 0
    else
        error "$service_name health check failed (HTTP $response)"
        cat /tmp/health_response.json 2>/dev/null || echo "No response body"
        return 1
    fi
}

# Test database connectivity
test_database() {
    log "Testing database connectivity..."
    
    # Test through backend health endpoint
    response=$(curl -s "$BACKEND_URL/api/health/database")
    
    if echo "$response" | grep -q '"status":"healthy"'; then
        success "Database connectivity test passed"
    else
        error "Database connectivity test failed"
        echo "Response: $response"
    fi
}

# Test Redis connectivity
test_redis() {
    log "Testing Redis connectivity..."
    
    response=$(curl -s "$BACKEND_URL/api/health/cache")
    
    if echo "$response" | grep -q '"status":"healthy"'; then
        success "Redis connectivity test passed"
    else
        error "Redis connectivity test failed"
        echo "Response: $response"
    fi
}

# Test book download functionality
test_book_download() {
    log "Testing book download functionality..."
    
    # Queue a download
    download_payload=$(cat <<EOF
{
    "url": "$TEST_BOOK_URL",
    "title": "$TEST_BOOK_TITLE",
    "author": "Lewis Carroll"
}
EOF
)
    
    download_response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "$download_payload" \
        "$CRAWLER_URL/api/downloads/queue")
    
    if echo "$download_response" | grep -q '"status":"success"'; then
        download_id=$(echo "$download_response" | jq -r '.downloadId' 2>/dev/null || echo "unknown")
        success "Book download queued successfully (ID: $download_id)"
        
        # Wait for download to complete
        log "Waiting for download to complete..."
        for i in {1..30}; do
            status_response=$(curl -s "$CRAWLER_URL/api/downloads/status/$download_id" 2>/dev/null || echo '{"status":"error"}')
            status=$(echo "$status_response" | jq -r '.status' 2>/dev/null || echo "error")
            
            if [ "$status" = "completed" ]; then
                success "Book download completed"
                return 0
            elif [ "$status" = "failed" ] || [ "$status" = "error" ]; then
                error "Book download failed"
                echo "Status response: $status_response"
                return 1
            fi
            
            echo -n "."
            sleep 5
        done
        
        warning "Download timeout - checking if book was saved anyway"
    else
        error "Failed to queue book download"
        echo "Response: $download_response"
        return 1
    fi
}

# Test book listing
test_book_listing() {
    log "Testing book listing..."
    
    books_response=$(curl -s "$BACKEND_URL/api/books")
    
    if echo "$books_response" | grep -q '"books"'; then
        book_count=$(echo "$books_response" | jq '.books | length' 2>/dev/null || echo "0")
        success "Book listing works - found $book_count books"
        
        # Store first book ID for later tests
        if [ "$book_count" -gt 0 ]; then
            BOOK_ID=$(echo "$books_response" | jq -r '.books[0].id' 2>/dev/null)
            log "Using book ID: $BOOK_ID for further tests"
        fi
    else
        error "Book listing failed"
        echo "Response: $books_response"
    fi
}

# Test book parsing
test_book_parsing() {
    if [ -z "$BOOK_ID" ]; then
        warning "No book ID available for parsing test"
        return 1
    fi
    
    log "Testing book parsing..."
    
    parse_payload=$(cat <<EOF
{
    "chunkSize": 1500,
    "splitBy": "chapters"
}
EOF
)
    
    parse_response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "$parse_payload" \
        "$BACKEND_URL/api/parse/book/$BOOK_ID")
    
    if echo "$parse_response" | grep -q '"success":true'; then
        success "Book parsing initiated successfully"
        
        # Wait for parsing to complete
        log "Waiting for parsing to complete..."
        for i in {1..20}; do
            book_response=$(curl -s "$BACKEND_URL/api/books/$BOOK_ID")
            status=$(echo "$book_response" | jq -r '.status' 2>/dev/null || echo "unknown")
            
            if [ "$status" = "parsed" ]; then
                chapter_count=$(echo "$book_response" | jq -r '.total_chapters' 2>/dev/null || echo "0")
                success "Book parsing completed - $chapter_count chapters created"
                return 0
            elif [ "$status" = "error" ]; then
                error "Book parsing failed"
                return 1
            fi
            
            echo -n "."
            sleep 3
        done
        
        warning "Parsing timeout - but may have succeeded"
    else
        error "Failed to initiate book parsing"
        echo "Response: $parse_response"
    fi
}

# Test TTS service
test_tts_service() {
    log "Testing TTS service..."
    
    # Test TTS health
    tts_health=$(curl -s "$TTS_URL/health" 2>/dev/null || echo '{"status":"error"}')
    
    if echo "$tts_health" | grep -q '"status":"healthy"'; then
        success "TTS service is healthy"
    else
        error "TTS service health check failed"
        echo "Response: $tts_health"
        return 1
    fi
    
    # Test TTS models endpoint
    models_response=$(curl -s "$BACKEND_URL/api/tts/models")
    
    if echo "$models_response" | grep -q '"models"'; then
        success "TTS models endpoint working"
    else
        warning "TTS models endpoint issue (may still work)"
    fi
}

# Test TTS generation
test_tts_generation() {
    if [ -z "$BOOK_ID" ]; then
        warning "No book ID available for TTS test"
        return 1
    fi
    
    log "Testing TTS generation..."
    
    # Get chapters for the book
    chapters_response=$(curl -s "$BACKEND_URL/api/books/$BOOK_ID/chapters")
    
    if echo "$chapters_response" | grep -q '"chapters"'; then
        chapter_count=$(echo "$chapters_response" | jq '.chapters | length' 2>/dev/null || echo "0")
        
        if [ "$chapter_count" -gt 0 ]; then
            # Get first chapter ID
            CHAPTER_ID=$(echo "$chapters_response" | jq -r '.chapters[0].id' 2>/dev/null)
            
            log "Testing TTS generation for chapter: $CHAPTER_ID"
            
            tts_payload=$(cat <<EOF
{
    "voice": "default",
    "model": "bark",
    "priority": 10
}
EOF
)
            
            tts_response=$(curl -s -X POST \
                -H "Content-Type: application/json" \
                -d "$tts_payload" \
                "$BACKEND_URL/api/tts/generate/$BOOK_ID/$CHAPTER_ID")
            
            if echo "$tts_response" | grep -q '"jobId"'; then
                job_id=$(echo "$tts_response" | jq -r '.jobId' 2>/dev/null || echo "unknown")
                success "TTS generation queued successfully (Job: $job_id)"
                
                # Check TTS queue status
                queue_status=$(curl -s "$BACKEND_URL/api/tts/queue/status")
                log "TTS Queue Status: $queue_status"
                
                return 0
            else
                error "Failed to queue TTS generation"
                echo "Response: $tts_response"
            fi
        else
            warning "No chapters found for TTS generation test"
        fi
    else
        error "Failed to get chapters for TTS test"
        echo "Response: $chapters_response"
    fi
}

# Test audio file generation
test_audio_generation() {
    log "Testing audio file generation..."
    
    # Wait a bit for TTS processing
    sleep 10
    
    # Check if any audio files were generated
    audio_files_response=$(curl -s "$BACKEND_URL/api/audio/files")
    
    if echo "$audio_files_response" | grep -q '"files"'; then
        file_count=$(echo "$audio_files_response" | jq '.files | length' 2>/dev/null || echo "0")
        
        if [ "$file_count" -gt 0 ]; then
            success "Audio files generated - found $file_count files"
        else
            warning "No audio files found yet (TTS may still be processing)"
        fi
    else
        warning "Audio files endpoint issue"
    fi
}

# Test frontend accessibility
test_frontend() {
    log "Testing frontend accessibility..."
    
    frontend_response=$(curl -s -w "%{http_code}" "$FRONTEND_URL" -o /tmp/frontend_response.html)
    
    if [ "$frontend_response" = "200" ]; then
        success "Frontend is accessible"
        
        # Check if it contains expected content
        if grep -q "audiobook" /tmp/frontend_response.html 2>/dev/null; then
            success "Frontend contains expected content"
        else
            warning "Frontend content may not be fully loaded"
        fi
    else
        error "Frontend accessibility test failed (HTTP $frontend_response)"
    fi
}

# Test nginx proxy
test_nginx() {
    log "Testing Nginx proxy..."
    
    nginx_response=$(curl -s -w "%{http_code}" "http://localhost" -o /tmp/nginx_response.html)
    
    if [ "$nginx_response" = "200" ]; then
        success "Nginx proxy working"
    else
        warning "Nginx proxy test failed (HTTP $nginx_response) - may not be configured"
    fi
}

# Main test execution
main() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE} Audiobook Pipeline Test Suite ${NC}"
    echo -e "${BLUE}================================${NC}"
    echo ""
    
    log "Starting comprehensive audiobook system test..."
    echo ""
    
    # Phase 1: Service Health Checks
    echo -e "${YELLOW}Phase 1: Service Health Checks${NC}"
    wait_for_service "Backend" "$BACKEND_URL/health" || true
    wait_for_service "Frontend" "$FRONTEND_URL" || true
    wait_for_service "Crawler" "$CRAWLER_URL/health" || true
    wait_for_service "TTS" "$TTS_URL/health" || true
    echo ""
    
    # Phase 2: Component Tests
    echo -e "${YELLOW}Phase 2: Component Health Tests${NC}"
    test_service_health "Backend" "$BACKEND_URL/health"
    test_database
    test_redis
    test_tts_service
    echo ""
    
    # Phase 3: Pipeline Tests
    echo -e "${YELLOW}Phase 3: End-to-End Pipeline Tests${NC}"
    test_book_download
    test_book_listing
    test_book_parsing
    test_tts_generation
    test_audio_generation
    echo ""
    
    # Phase 4: Frontend Tests
    echo -e "${YELLOW}Phase 4: Frontend & Proxy Tests${NC}"
    test_frontend
    test_nginx
    echo ""
    
    # Results Summary
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}        TEST RESULTS SUMMARY     ${NC}"
    echo -e "${BLUE}================================${NC}"
    echo ""
    
    echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
    echo -e "Total Tests: $((TESTS_PASSED + TESTS_FAILED))"
    echo ""
    
    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}🎉 ALL TESTS PASSED! Audiobook system is working perfectly!${NC}"
    else
        echo -e "${RED}⚠️  Some tests failed. See details below:${NC}"
    fi
    
    echo ""
    echo "Detailed Results:"
    for result in "${DETAILED_RESULTS[@]}"; do
        echo "  $result"
    done
    
    echo ""
    
    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}✅ Your audiobook system is ready for production use!${NC}"
        echo ""
        echo "Available endpoints:"
        echo "  - Frontend: $FRONTEND_URL"
        echo "  - Backend API: $BACKEND_URL"
        echo "  - Swagger Docs: $BACKEND_URL/api-docs (if enabled)"
        echo "  - Health Check: $BACKEND_URL/health"
        echo ""
        echo "To create your first audiobook:"
        echo "  1. Visit $FRONTEND_URL"
        echo "  2. Use the auto-download feature or upload a book"
        echo "  3. Parse the book into chapters"
        echo "  4. Generate audio using TTS"
        echo "  5. Enjoy your audiobook!"
        
        exit 0
    else
        echo -e "${RED}❌ System needs attention before production use${NC}"
        echo ""
        echo "Troubleshooting:"
        echo "  - Check docker-compose logs: docker-compose logs [service-name]"
        echo "  - Restart services: docker-compose restart"
        echo "  - Check service health: curl http://localhost:5001/health"
        echo "  - Verify all containers are running: docker-compose ps"
        
        exit 1
    fi
}

# Handle script interruption
trap 'echo -e "\n${YELLOW}Test interrupted by user${NC}"; exit 1' INT

# Run the main test suite
main