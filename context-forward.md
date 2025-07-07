# Context Forward: Self-Hosted Audiobook System Progress

## 🎯 Project Overview
Building a fully Dockerized self-hosted audiobook generator that:
- Scrapes books from Anna's Archive
- Parses PDF/EPUB content
- Converts text to high-quality speech using Python TTS (Bark/Tortoise)
- Serves with Node.js + React web player

## 📊 Current Progress

### ✅ Completed
1. **System Architecture Planned**
   - Microservices: Crawler, Parser, TTS API, Backend, Frontend
   - Shared volumes: `/books` and `/audio`
   - PostgreSQL for metadata, Redis for queuing

2. **Project Structure Created**
   ```
   /audiobook-app
   ├── /crawler       ✅ Complete
   ├── /parser        ⏳ Pending
   ├── /tts-api       ⏳ Pending
   ├── /backend       ⏳ Pending
   ├── /frontend      ⏳ Pending
   ├── /database      ✅ Schema created
   ├── docker-compose.yml ✅ Updated
   └── .env.example   ✅ Created
   ```

3. **Crawler Module (Node.js + Puppeteer)**
   - Searches Anna's Archive
   - Extracts book details
   - Downloads PDF/EPUB files to `/books/{author}/{title}.{ext}`
   - Bull queue with Redis for job management
   - PostgreSQL integration for book tracking
   - API endpoints:
     ```
     GET  /api/search?q=query
     GET  /api/search/details?url=
     POST /api/download
     GET  /api/queue/status
     GET  /api/queue/jobs
     GET  /api/download/stats
     ```

4. **Database Schema**
   - Tables: books, chapters, users, reading_progress, tts_jobs, download_queue
   - Triggers for updated_at timestamps
   - Indexes for performance

### ⏳ Pending Tasks
1. **Parser Module** - Extract text from PDF/EPUB, split into chapters
2. **TTS API** - Python microservice with Bark/Tortoise
3. **Backend API** - Express.js orchestrator
4. **Frontend** - React audio player with progress tracking
5. **Docker Compose** - Full stack orchestration
6. **Integration Testing** - End-to-end workflow

## 🔧 Technical Decisions
- **Crawler**: Puppeteer for JS-heavy sites, Bull for queue management
- **Storage**: Organized by author, tracked in PostgreSQL
- **TTS**: Separate Python service for model isolation
- **Architecture**: Microservices with shared volumes

## 📝 Key Files Created
- `/crawler/src/services/scraper.js` - Web scraping logic
- `/crawler/src/services/downloadManager.js` - File download handling
- `/crawler/src/services/queueManager.js` - Job queue management
- `/database/init.sql` - PostgreSQL schema
- `/docker-compose.yml` - Service orchestration
- `/docker-compose.dev.yml` - Development environment

## 🚀 Next Steps
1. Build Parser module to extract text from downloaded books
2. Create TTS API with Bark/Tortoise integration
3. Implement Backend API to orchestrate all services
4. Develop React frontend with audio player
5. Complete Docker setup for one-command deployment

## 💡 Testing
- Created `download-nexus.js` for testing book downloads
- Interactive test script at `/crawler/interactive-test.js`
- Test environment script: `./test-download.sh`

## 🐛 Known Issues
- None currently identified

## 📚 Resources
- Anna's Archive URL structure understood
- Download sources: LibGen, IPFS
- File organization: `/books/{author}/{title}.{ext}`

## 🔑 Environment Variables
```
DATABASE_URL=postgresql://audiobook:audiobook123@postgres:5432/audiobook_db
REDIS_URL=redis://redis:6379
BOOKS_PATH=/books
AUDIO_PATH=/audio
TTS_MODEL=bark
TTS_PORT=8000
```

## 📌 Session Notes
- Crawler successfully built with retry logic and progress tracking
- Database schema supports full audiobook lifecycle
- Ready to proceed with text extraction (parser) next

---
*Last Updated: Context forward for next session*
*Todo Status: 3/9 tasks completed*