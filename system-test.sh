#!/bin/bash

echo "=== AUDIOBOOK SYSTEM COMPREHENSIVE TEST ==="
echo "Time: $(date)"
echo ""

# Check Docker services
echo "1. DOCKER SERVICES CHECK:"
echo "-------------------------"
docker-compose ps
echo ""

# Count running services
RUNNING=$(docker-compose ps | grep -c "Up")
TOTAL=$(docker-compose ps --services | wc -l | tr -d ' ')
echo "Services: $RUNNING/$TOTAL running"
echo ""

# Test each service
echo "2. SERVICE ENDPOINT TESTS:"
echo "--------------------------"

# Backend API
echo -n "Backend API (5001): "
curl -s http://localhost:5001/health > /dev/null 2>&1 && echo "✅ OK" || echo "❌ FAILED"

# Frontend
echo -n "Frontend (3000): "
curl -s http://localhost:3000 > /dev/null 2>&1 && echo "✅ OK" || echo "❌ FAILED"

# TTS API
echo -n "TTS API (8000): "
curl -s http://localhost:8000/health > /dev/null 2>&1 && echo "✅ OK" || echo "❌ FAILED"

# Database
echo -n "PostgreSQL (5433): "
PGPASSWORD=audiobook123 psql -h localhost -p 5433 -U audiobook -d audiobook_db -c "SELECT 1" > /dev/null 2>&1 && echo "✅ OK" || echo "❌ FAILED"

# Redis
echo -n "Redis (6380): "
redis-cli -p 6380 ping > /dev/null 2>&1 && echo "✅ OK" || echo "❌ FAILED"

echo ""
echo "3. FILE SYSTEM CHECK:"
echo "---------------------"
echo "E2E test files: $(ls test-e2e*.js 2>/dev/null | wc -l)"
echo "Production config: $([ -f .env.production ] && echo "✅ EXISTS" || echo "❌ MISSING")"
echo "Docker override: $([ -f docker-compose.override.yml ] && echo "✅ EXISTS" || echo "❌ MISSING")"

echo ""
echo "4. TEST RESULTS:"
echo "----------------"
cd backend 2>/dev/null && npm test 2>&1 | grep -E "(Test Suites|Tests:)" | tail -2 || echo "Backend tests not available"

echo ""
echo "=== TEST COMPLETE ===