# 🎧 Self-Hosted Audiobook System

A complete dockerized solution for creating and streaming audiobooks from PDF/EPUB files using AI-powered text-to-speech.

## ✨ Features

### 📚 Complete Audiobook Pipeline
- **Web Scraping**: Download books from Anna's Archive
- **Text Extraction**: Parse PDF/EPUB files into clean text
- **AI Text-to-Speech**: Convert text to natural speech using EmotiVoice
- **Web Player**: Stream and control audiobook playback
- **Progress Tracking**: Resume from where you left off

### 🎙️ Advanced TTS Capabilities
- **EmotiVoice AI**: High-quality neural text-to-speech
- **Multiple Speakers**: Choose from different voice personas
- **Emotion Control**: Happy, sad, angry, neutral expressions
- **Bilingual Support**: English and Chinese languages
- **Speed Control**: 0.5x to 2.0x playback speed
- **Quality Processing**: Audio normalization and enhancement

### 🖥️ Modern Web Interface
- **Responsive Design**: Works on desktop and mobile
- **Chapter Navigation**: Browse and jump between chapters
- **HTML5 Audio Player**: Seeking, volume, speed controls
- **Progress Persistence**: localStorage saves playback position
- **Real-time Status**: Shows generation progress and availability

### 🐳 Production Ready
- **Docker Compose**: One-command deployment
- **Microservices**: Scalable containerized architecture
- **Nginx Proxy**: Optimized audio streaming with range requests
- **Database**: PostgreSQL for metadata and progress
- **Caching**: Redis for job queues and performance

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│    Frontend     │    │     Backend     │    │    TTS API      │
│   (Next.js)     │───▶│   (Express)     │───▶│  (EmotiVoice)   │
│   Port: 3000    │    │   Port: 5001    │    │   Port: 8000    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                        │                        │
         │                        ▼                        ▼
         │              ┌─────────────────┐    ┌─────────────────┐
         │              │    Database     │    │  Audio Storage  │
         │              │  (PostgreSQL)   │    │     (/audio)    │
         │              │   Port: 5432    │    │                 │
         │              └─────────────────┘    └─────────────────┘
         │                        │
         ▼                        ▼
┌─────────────────┐    ┌─────────────────┐
│     Nginx       │    │      Redis      │
│   Port: 80      │    │   Port: 6379    │
│  (Proxy + CDN)  │    │ (Queue + Cache) │
└─────────────────┘    └─────────────────┘
         │                        │
         ▼                        ▼
┌─────────────────┐    ┌─────────────────┐
│    Crawler      │    │     Parser      │
│  (Puppeteer)    │    │   (PDF/EPUB)    │
│ Book Downloader │    │ Text Extractor  │
└─────────────────┘    └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- 4GB+ RAM (for TTS models)
- 10GB+ storage space

### One-Command Deployment

```bash
# Clone repository
git clone <repository-url>
cd audiobook-app

# Deploy entire system
./deploy.sh
```

### Manual Setup

```bash
# 1. Start all services
docker-compose -f docker-compose.prod.yml up -d

# 2. Check service health
docker-compose -f docker-compose.prod.yml ps

# 3. View logs
docker-compose -f docker-compose.prod.yml logs -f
```

### Access Your System
- **Web Interface**: http://localhost:3000
- **API Endpoints**: http://localhost:5001
- **TTS Service**: http://localhost:8000
- **Nginx Proxy**: http://localhost:80

## 📖 Usage Guide

### 1. Download Books
Use the crawler to download books from Anna's Archive:

```bash
# Search and download books
curl -X POST http://localhost:5001/api/crawler/search \
  -H "Content-Type: application/json" \
  -d '{"query": "Foundation Isaac Asimov", "limit": 5}'
```

### 2. Parse Text Content
Extract clean text from downloaded PDF/EPUB files:

```bash
# Parse a book into chapters
curl -X POST http://localhost:5001/api/parser/parse \
  -H "Content-Type: application/json" \
  -d '{"bookPath": "/books/author/book.pdf"}'
```

### 3. Generate Audio
Convert text to speech using EmotiVoice:

```bash
# Generate audio for a chapter
curl -X POST http://localhost:8000/tts \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Chapter content here...",
    "book": "foundation",
    "chapter": "1",
    "speaker": "9017",
    "emotion": "neutral"
  }'
```

### 4. Stream & Listen
Open http://localhost:3000 in your browser to:
- Browse your book library
- Select chapters to play
- Control playback (play/pause/seek)
- Track reading progress
- Resume from last position

## 🔧 Configuration

### Environment Variables

Create `.env` file:

```env
# Database
POSTGRES_USER=audiobook
POSTGRES_PASSWORD=audiobook123
POSTGRES_DB=audiobook_db

# Security
JWT_SECRET=your-secret-key-here

# TTS Settings
TTS_MODEL=emotivoice
TTS_DEVICE=cpu

# Paths
BOOKS_PATH=/books
AUDIO_PATH=/audio

# Ports
FRONTEND_PORT=3000
BACKEND_PORT=5001
TTS_PORT=8000
```

### Audio Quality Settings

Modify `tts-api/app.py`:

```python
# High quality settings
QUALITY_SETTINGS = {
    "sample_rate": 24000,
    "bitrate": "192k", 
    "speaker": "9017",     # Female voice
    "emotion": "neutral",
    "speed": 1.0
}
```

### Storage Volumes

```yaml
volumes:
  books_volume:     # Downloaded books (PDF/EPUB)
  audio_volume:     # Generated audio files (MP3)
  postgres_data:    # Database persistence
  redis_data:       # Cache and queues
  tts_models:       # AI model cache
```

## 📁 Project Structure

```
audiobook-app/
├── frontend/              # Next.js web interface
│   ├── app/              # App router pages
│   ├── components/       # React components
│   ├── lib/             # API client & utilities
│   └── Dockerfile       # Container config
├── backend/              # Express.js API server
│   ├── src/
│   │   ├── routes/      # API endpoints
│   │   ├── services/    # Business logic
│   │   └── middleware/  # Auth & validation
│   └── Dockerfile
├── tts-api/              # Python TTS microservice
│   ├── app.py           # FastAPI server
│   ├── emotivoice_engine.py  # TTS engine
│   ├── audio_utils.py   # Audio processing
│   └── Dockerfile
├── crawler/              # Web scraping service
│   ├── src/services/    # Scraper logic
│   └── Dockerfile
├── parser/               # Text extraction service
│   ├── src/parsers/     # PDF/EPUB processors
│   └── Dockerfile
├── database/             # PostgreSQL schemas
│   └── init.sql
├── nginx/                # Reverse proxy config
│   └── nginx.conf
├── docker-compose.yml    # Development setup
├── docker-compose.prod.yml  # Production setup
└── deploy.sh            # Deployment script
```

## 🧪 Testing

### Frontend Testing
```bash
cd frontend
npm run dev
# Visit http://localhost:3000
```

### Backend API Testing
```bash
cd backend
node test-backend.js
```

### TTS Service Testing
```bash
cd tts-api
python test_tts.py
```

### Integration Testing
```bash
# Test complete workflow
./test-system.sh
```

## 📊 API Reference

### Books API
```
GET  /api/books                 # List all books
GET  /api/books/:slug           # Get book details
GET  /api/books/:slug/chapters  # Get chapters
POST /api/books/:slug/parse     # Parse book text
```

### Audio API
```
GET  /api/audio/:book/:chapter     # Stream audio file
GET  /api/audio/:book/:chapter/info # Get audio metadata
POST /api/generate/:book/:chapter   # Generate TTS audio
```

### TTS API
```
POST /tts                       # Generate speech
GET  /health                    # Service health
GET  /speakers                  # Available voices
```

### Crawler API
```
POST /api/crawler/search        # Search books
POST /api/crawler/download      # Download book
GET  /api/crawler/status        # Download status
```

## 🔒 Security Features

- **Input Validation**: Sanitized file paths and user input
- **Content Security**: PDF/EPUB parsing in isolated containers
- **Network Security**: Internal Docker networking
- **Resource Limits**: Memory and CPU constraints
- **Error Handling**: Graceful failure handling
- **Audit Logging**: Operation tracking

## 🚦 Monitoring

### Health Checks
```bash
# Check all services
curl http://localhost:5001/health
curl http://localhost:8000/health

# Check Docker containers
docker-compose ps
```

### Log Monitoring
```bash
# View all logs
docker-compose logs -f

# Service-specific logs
docker-compose logs -f backend
docker-compose logs -f tts-api
```

### Resource Usage
```bash
# Container stats
docker stats

# Volume usage
docker system df
```

## 🔧 Troubleshooting

### Common Issues

**TTS Generation Fails:**
```bash
# Check TTS service logs
docker-compose logs tts-api

# Verify models downloaded
docker exec audiobook-tts ls -la /root/.cache

# Test TTS API directly
curl -X POST http://localhost:8000/tts -d '{"text":"test","book":"test","chapter":"1"}'
```

**Audio Won't Play:**
```bash
# Check audio file exists
ls -la audio/book-name/

# Verify file permissions
docker exec audiobook-backend ls -la /audio

# Test direct audio access
curl -I http://localhost:5001/api/audio/book/chapter
```

**Frontend Not Loading:**
```bash
# Check frontend logs
docker-compose logs frontend

# Verify API proxy
curl http://localhost:3000/api/books

# Check backend connectivity
curl http://localhost:5001/api/books
```

### Performance Optimization

**TTS Performance:**
- Use GPU if available (`TTS_DEVICE=cuda`)
- Increase memory limits in docker-compose
- Cache models in persistent volume

**Audio Streaming:**
- Enable nginx caching
- Use range requests for seeking
- Compress audio files appropriately

**Database Optimization:**
- Add indexes for frequent queries
- Configure PostgreSQL memory settings
- Use connection pooling

## 🛠️ Development

### Local Development Setup

```bash
# Start dependencies only
docker-compose up postgres redis

# Run services locally
cd backend && npm run dev
cd frontend && npm run dev  
cd tts-api && python app.py
```

### Contributing Guidelines

1. **Fork** the repository
2. **Create** feature branch (`git checkout -b feature/amazing-feature`)
3. **Test** your changes thoroughly
4. **Commit** changes (`git commit -m 'Add amazing feature'`)
5. **Push** to branch (`git push origin feature/amazing-feature`)
6. **Open** Pull Request

### Adding New Features

**New TTS Voice:**
```python
# Add to emotivoice_engine.py
self.available_speakers = {
    "9018": "new_speaker_name",
    # ... existing speakers
}
```

**New Audio Format:**
```python
# Modify audio_utils.py
SUPPORTED_FORMATS = ["mp3", "wav", "m4a", "ogg"]
```

**New Book Source:**
```javascript
// Add to crawler/src/services/
class NewSourceScraper {
    async search(query) { /* implementation */ }
    async download(url) { /* implementation */ }
}
```

## 📈 Roadmap

### Phase 1: Core Features ✅
- [x] PDF/EPUB parsing
- [x] EmotiVoice TTS integration  
- [x] Web audio player
- [x] Progress tracking
- [x] Docker deployment

### Phase 2: Enhanced Experience
- [ ] Mobile app (React Native)
- [ ] Offline listening
- [ ] Playlist management
- [ ] User accounts & sync
- [ ] Advanced TTS controls

### Phase 3: AI & Automation
- [ ] Automatic chapter detection
- [ ] Voice cloning
- [ ] Smart speed adjustment
- [ ] Content recommendations
- [ ] Audio quality enhancement

### Phase 4: Scale & Performance
- [ ] Kubernetes deployment
- [ ] CDN integration
- [ ] Multi-language support
- [ ] Advanced caching
- [ ] Analytics dashboard

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **EmotiVoice**: NetEase Youdao's open-source TTS system
- **Anna's Archive**: Digital library preservation
- **Next.js**: React framework for production
- **PostgreSQL**: Reliable database system
- **Docker**: Containerization platform

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/your-repo/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-repo/discussions)
- **Documentation**: [Wiki](https://github.com/your-repo/wiki)

---

**Happy Listening! 🎧📚**

Built with ❤️ for the audiobook community