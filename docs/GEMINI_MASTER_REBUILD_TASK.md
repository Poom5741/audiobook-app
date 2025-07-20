# 🔥 GEMINI MASTER REBUILD ASSIGNMENT - COMPLETE AUDIOBOOK PIPELINE

## YOUR MISSION: Fix everything while Claude orchestrates

### IMMEDIATE TASKS (DO NOW):

## 1. TEST CURRENT SYSTEM STATE
```bash
# Test each service endpoint
curl http://localhost:5001/health
curl http://localhost:8000/health  
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3000

# Check Docker containers
docker-compose ps
docker-compose logs --tail=50

# Test Anna's Archive crawler
curl -X POST http://localhost:3001/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "Isaac Asimov Foundation", "limit": 5}'
```

## 2. FIX ALL DOCKER SHARED MODULE ISSUES
```bash
# The problem: All Node services can't find shared modules
# Root cause: Docker build context and module paths

# Fix approach:
1. Check each service Dockerfile (backend, crawler, parser)
2. Ensure shared/ is copied correctly in Docker build
3. Install winston and other deps in shared/
4. Test each service can import from shared/

# Services to fix:
- backend/Dockerfile
- crawler/Dockerfile  
- parser/Dockerfile
```

## 3. TEST & FIX CRAWLER → ANNA'S ARCHIVE
```bash
# The crawler has an epub in temp-uploads - test if it works
1. Test search functionality
2. Test download functionality
3. Verify files save to correct location
4. Test with multiple book formats (pdf, epub)

# If broken, check:
- Puppeteer browser initialization
- Anna's Archive DOM selectors (may have changed)
- Download link extraction logic
```

## 4. TEST & FIX PARSER SERVICE
```bash
# Test parsing the existing epub
curl -X POST http://localhost:3002/api/parse \
  -H "Content-Type: application/json" \
  -d '{"filePath": "/app/temp-uploads/Trading in the Zone....epub"}'

# Fix any issues with:
- File path resolution
- EPUB/PDF parsing libraries
- Chapter detection logic
- Text cleaning
```

## 5. TEST & FIX TTS PIPELINE
```bash
# Test TTS generation
curl -X POST http://localhost:8000/tts \
  -H "Content-Type: application/json" \
  -d '{
    "text": "This is a test of the audiobook generation system.",
    "book": "test-book", 
    "chapter": "1"
  }'

# Verify:
- Audio file created in correct location
- Audio quality is acceptable
- Processing time is reasonable
```

## 6. FIX FRONTEND BUILD
```bash
# The frontend shows BlockEdge instead of audiobook app
docker-compose down frontend
docker-compose build frontend --no-cache
docker-compose up -d frontend

# Test it shows audiobook UI at localhost:3000
```

## 7. CREATE FULL INTEGRATION TEST
Create test script that:
1. Searches for a book on Anna's Archive
2. Downloads the book
3. Parses text from book
4. Generates audio with TTS
5. Verifies audio playable in frontend

## CRITICAL FIXES NEEDED:

### A. Shared Module Fix (ALL Services)
```javascript
// Each Dockerfile needs:
COPY shared /shared
WORKDIR /shared
RUN npm install
WORKDIR /app
```

### B. Database Schema Check
```sql
-- Ensure these tables exist:
- books (id, title, author, file_path, created_at)
- chapters (id, book_id, number, title, text_content)
- audio_files (id, chapter_id, file_path, duration)
- user_progress (id, user_id, chapter_id, position)
```

### C. File Path Consistency
Ensure all services use same paths:
- Books: /books
- Audio: /audio  
- Temp: /temp-uploads

## REPORTING REQUIREMENTS:
1. Test each component and report status
2. Fix issues as you find them
3. Document what's broken vs working
4. Create fixes and test immediately
5. Report back with % functionality achieved

## SUCCESS CRITERIA:
✅ Can search books on Anna's Archive
✅ Can download epub/pdf files
✅ Can parse text from files
✅ Can generate audio from text
✅ Can play audio in frontend
✅ Full pipeline works end-to-end

## GO! Start with task 1 and work through systematically. I'm handling the architecture redesign while you fix the implementation details.