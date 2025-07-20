# 🏗️ AUDIOBOOK SYSTEM ARCHITECTURE REDESIGN

## CURRENT PROBLEMS
1. **Anna's Archive scraper failing** - Puppeteer browser detachment issues
2. **Overly complex microservices** - Too many moving parts for simple pipeline
3. **Shared module dependencies** - Docker build issues with winston/logger
4. **Pipeline reliability** - Multiple failure points, no recovery
5. **35+ second search timeouts** - Poor performance

## NEW SIMPLIFIED ARCHITECTURE

### Core Pipeline (3 Steps Only)
```
1. DOWNLOAD → 2. PROCESS → 3. PLAY
```

### Service Consolidation
```yaml
OLD (7 services):
- crawler
- parser  
- tts-api
- backend
- frontend
- postgres
- redis

NEW (4 services):
- api (combines crawler/parser/backend)
- tts (Python TTS service)
- frontend (Next.js UI)
- postgres (database)
```

## IMPLEMENTATION PLAN

### Phase 1: Create Unified API Service
Combine crawler + parser + backend into single Node.js service:

```javascript
// api/src/services/annaArchive.js
class AnnaArchiveService {
  async searchBooks(query) {
    // Direct HTTP API calls instead of Puppeteer
    // Use axios to call Anna's Archive API endpoints
  }
  
  async downloadBook(bookId) {
    // Direct download with progress tracking
  }
}

// api/src/services/bookProcessor.js  
class BookProcessor {
  async parseEpub(filePath) {
    // Use epub library directly
  }
  
  async parsePdf(filePath) {
    // Use pdf-parse library
  }
  
  async splitChapters(text) {
    // Smart chapter detection
  }
}

// api/src/services/audioGenerator.js
class AudioGenerator {
  async generateAudio(text, bookId, chapterId) {
    // Call Python TTS service
    // Store in /audio directory
  }
}
```

### Phase 2: Simplify TTS Service
Keep Python TTS minimal:

```python
# tts/app.py
from fastapi import FastAPI
from tts_engine import TTSEngine

app = FastAPI()
engine = TTSEngine()

@app.post("/generate")
async def generate(text: str, output_path: str):
    audio_path = await engine.synthesize(text, output_path)
    return {"audio_path": audio_path}
```

### Phase 3: Fix Anna's Archive Integration
Replace Puppeteer with direct API:

```javascript
// Use Anna's Archive JSON API
const ANNA_API = 'https://annas-archive.org/search.json';

async function searchBooks(query) {
  const response = await axios.get(ANNA_API, {
    params: { q: query, limit: 10 }
  });
  return response.data;
}
```

### Phase 4: Implement Reliable Queue
Simple database-backed queue:

```sql
CREATE TABLE job_queue (
  id SERIAL PRIMARY KEY,
  type VARCHAR(50), -- 'download', 'parse', 'tts'
  status VARCHAR(50), -- 'pending', 'processing', 'completed', 'failed'
  payload JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Phase 5: Create Simple Pipeline
```javascript
class AudiobookPipeline {
  async createAudiobook(bookUrl) {
    // 1. Download book
    const bookPath = await this.downloadBook(bookUrl);
    
    // 2. Parse text
    const chapters = await this.parseBook(bookPath);
    
    // 3. Generate audio for each chapter
    for (const chapter of chapters) {
      await this.generateAudio(chapter);
    }
    
    return { bookId, chapters };
  }
}
```

## DOCKER SIMPLIFICATION

```yaml
# docker-compose.yml
services:
  api:
    build: ./api
    ports:
      - "5000:5000"
    volumes:
      - ./books:/books
      - ./audio:/audio
    depends_on:
      - postgres
      - tts

  tts:
    build: ./tts
    ports:
      - "8000:8000"
    volumes:
      - ./audio:/audio

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:5000

  postgres:
    image: postgres:15
    ports:
      - "5432:5432"
    volumes:
      - ./database/init.sql:/docker-entrypoint-initdb.d/init.sql
```

## API ENDPOINTS (SIMPLIFIED)

```
POST /api/books/search
  Body: { query: "book name" }
  Response: { books: [...] }

POST /api/books/create
  Body: { url: "anna-archive-url" }
  Response: { jobId: "..." }

GET /api/books
  Response: { books: [...] }

GET /api/books/:id
  Response: { book: {...}, chapters: [...] }

POST /api/audio/generate/:bookId/:chapterId
  Response: { audioUrl: "..." }

GET /api/audio/:bookId/:chapterId
  Response: Audio file stream
```

## IMMEDIATE FIXES NEEDED

1. **Remove Puppeteer** - Use direct HTTP calls
2. **Consolidate services** - Merge into single API
3. **Fix shared modules** - Embed directly in services
4. **Simplify Docker** - Reduce to 4 containers
5. **Add error recovery** - Retry failed operations

## SUCCESS METRICS
- Search completes in <2 seconds
- Book download works reliably
- Text parsing handles epub/pdf/txt
- Audio generation completes without errors
- Full pipeline works end-to-end
- No Docker build issues
- Simple to deploy and maintain

## NEXT STEPS
1. Create new consolidated API service
2. Migrate existing code to new structure
3. Test with real Anna's Archive books
4. Deploy simplified system
5. Add monitoring and error handling