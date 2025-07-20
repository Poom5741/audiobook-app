# 🎧 Audiobook System Usage Guide

## 🚀 Quick Start

1. **Start the system:**
   ```bash
   docker-compose up --build
   ```

2. **Wait for all services to be ready** (2-3 minutes)

3. **Open your browser and navigate to one of these interfaces:**

## 📱 Web Interfaces

### 🎬 Complete Audiobook Pipeline
**File:** `audiobook-pipeline.html`  
**Open:** [audiobook-pipeline.html](./audiobook-pipeline.html)

**Features:**
- ✅ Search for any book topic
- ✅ Automatic download from Anna's Archive  
- ✅ Text extraction from PDF/EPUB
- ✅ TTS audio generation
- ✅ Real-time progress tracking
- ✅ Complete audiobook creation

**How to use:**
1. Enter a search term (e.g., "programming", "science fiction")
2. Select format (EPUB/PDF) and number of books
3. Click "🎬 Start Audiobook Pipeline"
4. Monitor progress in real-time
5. Access completed audiobooks in the main app

### 📚 Simple Book Downloader
**File:** `book-downloader.html`  
**Open:** [book-downloader.html](./book-downloader.html)

**Features:**
- ✅ Search and browse books
- ✅ One-click downloads
- ✅ Download statistics
- ✅ Auto-download controls

### 🤖 Auto-Download Manager
**File:** `auto-download-control.html`  
**Open:** [auto-download-control.html](./auto-download-control.html)

**Features:**
- ✅ Scheduled automatic downloads
- ✅ Configurable intervals and quantities
- ✅ Background processing
- ✅ Activity monitoring

### 🎵 Main Audiobook Player
**URL:** http://localhost:3000

**Features:**
- ✅ Browse audiobook library
- ✅ Chapter navigation
- ✅ Progress tracking
- ✅ Resume playback

## 🔧 API Endpoints

### Pipeline API (Port 3001)
```bash
# Create complete audiobook pipeline
POST http://localhost:3001/api/pipeline/create-audiobook
{
  "searchQuery": "programming",
  "format": "epub,pdf",
  "maxBooks": 1
}

# Check pipeline status
GET http://localhost:3001/api/pipeline/status/{jobId}

# List all pipeline jobs
GET http://localhost:3001/api/pipeline/jobs
```

### Search & Download API
```bash
# Search for books
GET http://localhost:3001/api/search?q=programming&limit=10

# Download a book
POST http://localhost:3001/api/download
{
  "bookUrl": "https://example.com/book.epub",
  "priority": 1
}

# Get download statistics
GET http://localhost:3001/api/download/stats
```

### Auto-Download API
```bash
# Start auto-downloader
POST http://localhost:3001/api/auto/start

# Stop auto-downloader
POST http://localhost:3001/api/auto/stop

# Get status
GET http://localhost:3001/api/auto/status

# Trigger manual download session
POST http://localhost:3001/api/auto/download-now
```

## 📋 Step-by-Step Process

### Automated Pipeline (Recommended)

1. **Open** `audiobook-pipeline.html` in your browser
2. **Enter** search term: "machine learning", "philosophy", etc.
3. **Configure** format and number of books
4. **Click** "Start Audiobook Pipeline"
5. **Monitor** real-time progress:
   - 🔍 **Search**: Finding books on Anna's Archive
   - ⬇️ **Download**: Downloading book files
   - 📄 **Parse**: Extracting text from PDF/EPUB
   - 🎧 **TTS**: Generating audio with AI voice
   - ✅ **Complete**: Audiobook ready!

### Manual Process

1. **Search** books using the book downloader interface
2. **Download** selected books manually
3. **Wait** for automatic parsing and TTS processing
4. **Access** completed audiobooks in the main player

## ⚙️ Configuration

### Auto-Download Settings
- **Interval**: How often to search for new books (30min - 6hrs)
- **Max per session**: How many books to download each time (1-5)
- **Search queries**: Topics to automatically search for

### TTS Settings
- **Voice**: Currently uses espeak (lightweight, fast)
- **Speed**: Adjustable speech rate
- **Format**: MP3 output with chapter breakdown

## 📊 Monitoring

### Real-Time Progress
- **Visual progress bars** for each pipeline step
- **Estimated completion time** based on book size
- **Step-by-step status updates**
- **Error handling** with retry logic

### Statistics Dashboard
- **Total books** in library
- **Active downloads** and processing
- **Completion rates** and average times
- **Failed jobs** with error details

## 🛠️ Troubleshooting

### Common Issues

1. **Services not starting**
   ```bash
   docker-compose down
   docker-compose up --build
   ```

2. **Download failures**
   - Check internet connection
   - Verify Anna's Archive availability
   - Try different search terms

3. **TTS generation slow**
   - Current setup uses lightweight espeak
   - Processing time: ~2-5 minutes per book
   - Larger books take longer

4. **Port conflicts**
   - Frontend: http://localhost:3000
   - Backend: http://localhost:5001  
   - Crawler/Pipeline: http://localhost:3001
   - TTS API: http://localhost:8000

### Performance Tips

1. **Start with small books** (programming guides, short stories)
2. **Use EPUB format** when possible (faster parsing)
3. **Limit concurrent downloads** to avoid rate limiting
4. **Monitor disk space** (audiobooks can be large)

## 🎯 Best Practices

### Search Terms
- ✅ **Good**: "python programming", "machine learning basics"
- ✅ **Good**: "science fiction short stories", "philosophy introduction"  
- ❌ **Avoid**: Too specific author names or exact titles
- ❌ **Avoid**: Very long or complex search phrases

### Book Selection
- **EPUB preferred** over PDF for better text extraction
- **Shorter books** (< 300 pages) process faster
- **English language** books work best with current TTS
- **Technical books** may have formatting issues

### System Usage
- **Monitor resources** - each pipeline job uses CPU/memory
- **Schedule auto-downloads** during off-peak hours
- **Regular cleanup** of failed or incomplete jobs
- **Backup completed audiobooks** before system updates

## 📈 Advanced Usage

### Batch Processing
```bash
# Use the auto-download script for bulk processing
./auto-download.sh "science fiction"
./auto-download.sh "programming"
./auto-download.sh "philosophy"
```

### API Integration
```javascript
// Create audiobook programmatically
const response = await fetch('http://localhost:3001/api/pipeline/create-audiobook', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    searchQuery: 'artificial intelligence',
    format: 'epub',
    maxBooks: 2
  })
});

const { jobId } = await response.json();
console.log('Pipeline started:', jobId);
```

### Custom Workflows
- **Scheduled downloads**: Set up cron jobs with the API
- **Quality filtering**: Use download stats to skip low-quality books
- **Topic rotation**: Automatically vary search terms over time
- **User requests**: Allow others to submit audiobook requests

## 🎉 Success!

When everything works correctly, you'll have:
- 📚 **Searchable book database** with thousands of titles
- 🤖 **Automatic downloading** from Anna's Archive
- 📖 **Text extraction** from PDF and EPUB files  
- 🎧 **AI-generated audio** with chapter navigation
- 🌐 **Beautiful web interface** for browsing and listening
- 📊 **Progress tracking** and statistics
- 🔄 **Automated pipeline** requiring minimal intervention

Enjoy your personal audiobook library! 🎧✨