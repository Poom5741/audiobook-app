# Design Document

## Overview

This design document outlines the comprehensive solution to fix and enhance the Self-Hosted Audiobook System. The system follows a microservices architecture with Docker containerization, featuring a React/Next.js frontend, Express.js backend, Python TTS service, and supporting services for web scraping, parsing, and queue management.

## Architecture

### High-Level Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        WEB[Web Browser]
        MOBILE[Mobile App]
    end

    subgraph "Load Balancer"
        NGINX[Nginx Proxy]
    end

    subgraph "Frontend Services"
        FRONTEND[Next.js Frontend<br/>Port: 3000]
    end

    subgraph "API Gateway"
        BACKEND[Express.js Backend<br/>Port: 5001]
    end

    subgraph "Core Services"
        TTS[TTS API Service<br/>Python FastAPI<br/>Port: 8000]
        PARSER[Parser Service<br/>Node.js<br/>Port: 3002]
        CRAWLER[Crawler Service<br/>Node.js<br/>Port: 3001]
        AUTH[Auth Service<br/>Node.js<br/>Port: 8002]
    end

    subgraph "Data Layer"
        POSTGRES[(PostgreSQL<br/>Port: 5432)]
        REDIS[(Redis<br/>Port: 6379)]
        FILES[File Storage<br/>Books & Audio]
    end

    WEB --> NGINX
    MOBILE --> NGINX
    NGINX --> FRONTEND
    NGINX --> BACKEND

    FRONTEND --> BACKEND
    BACKEND --> TTS
    BACKEND --> PARSER
    BACKEND --> CRAWLER
    BACKEND --> AUTH

    BACKEND --> POSTGRES
    BACKEND --> REDIS
    TTS --> FILES
    PARSER --> FILES
    CRAWLER --> FILES

    TTS --> POSTGRES
    PARSER --> POSTGRES
    CRAWLER --> POSTGRES
    AUTH --> POSTGRES
```

### Service Communication

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant B as Backend
    participant C as Crawler
    participant P as Parser
    participant T as TTS
    participant Q as Queue
    participant D as Database

    U->>F: Upload/Search Book
    F->>B: API Request
    B->>C: Search/Download
    C->>D: Save Book Record
    C->>P: Parse Book
    P->>D: Save Chapters
    P->>Q: Queue TTS Jobs
    Q->>T: Process TTS
    T->>D: Update Status
    T-->>F: Progress Updates
    F-->>U: Real-time Updates
```

## Components and Interfaces

### 1. Frontend Service (Next.js)

**Purpose**: User interface for audiobook management and playback

**Key Components**:

- **Pages**: Home, Book Details, Audio Player, Pipeline Management
- **Components**: AudioPlayer, BookCard, ProgressTracker, PipelineForm
- **State Management**: React Context + localStorage for progress
- **API Client**: Axios with authentication and error handling

**Interfaces**:

```typescript
interface BookService {
  getBooks(): Promise<Book[]>;
  getBook(id: string): Promise<Book>;
  getChapters(bookId: string): Promise<Chapter[]>;
  deleteBook(id: string): Promise<void>;
}

interface AudioService {
  getAudioUrl(bookId: string, chapterId: string): string;
  getAudioInfo(bookId: string, chapterId: string): Promise<AudioInfo>;
  streamAudio(bookId: string, chapterId: string): ReadableStream;
}

interface PipelineService {
  createAudiobook(options: CreateAudiobookOptions): Promise<string>;
  getPipelineStatus(jobId: string): Promise<PipelineStatus>;
  cancelPipeline(jobId: string): Promise<void>;
}
```

### 2. Backend Service (Express.js)

**Purpose**: Main API gateway and business logic coordinator

**Key Components**:

- **Routes**: Books, Audio, TTS, Auth, Users, Health
- **Middleware**: Authentication, Validation, Caching, Security
- **Services**: Database, Queue, Cache, Circuit Breaker
- **Utils**: Logger, File Manager, Error Handler

**Database Schema**:

```sql
-- Enhanced schema with proper relationships
CREATE TABLE books (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(500) NOT NULL,
    author VARCHAR(500),
    isbn VARCHAR(20),
    file_path VARCHAR(1000) NOT NULL,
    file_type VARCHAR(10) NOT NULL,
    cover_image TEXT,
    description TEXT,
    language VARCHAR(10) DEFAULT 'en',
    total_chapters INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'downloaded',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Add indexes for performance
    INDEX idx_books_status (status),
    INDEX idx_books_title (title),
    INDEX idx_books_author (author)
);

CREATE TABLE chapters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter_number INTEGER NOT NULL,
    title VARCHAR(500),
    text_content TEXT,
    audio_path VARCHAR(1000),
    duration INTEGER,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(book_id, chapter_number),
    INDEX idx_chapters_book_id (book_id),
    INDEX idx_chapters_status (status)
);
```

### 3. TTS Service (Python FastAPI)

**Purpose**: Text-to-speech conversion using EmotiVoice/SimpleTTS

**Key Components**:

- **TTS Engine**: EmotiVoice integration with fallback to espeak
- **Audio Processor**: MP3 conversion, normalization, quality control
- **File Manager**: Audio file organization and cleanup
- **Queue Processor**: Async job processing

**API Endpoints**:

```python
@app.post("/tts")
async def generate_tts(request: TTSRequest) -> TTSResponse

@app.get("/health")
async def health_check() -> HealthResponse

@app.get("/speakers")
async def get_speakers() -> SpeakersResponse

@app.get("/audio/{book}/{chapter}/info")
async def get_audio_info(book: str, chapter: str) -> AudioInfoResponse
```

### 4. Parser Service (Node.js)

**Purpose**: Extract text from PDF/EPUB files and split into chapters

**Key Components**:

- **File Parsers**: PDF (pdf-parse), EPUB (epub2), TXT (fs)
- **Text Processor**: Cleaning, chapter detection, formatting
- **Chapter Splitter**: Smart chapter detection and splitting
- **Database Integration**: Save parsed content

**Processing Pipeline**:

```javascript
async function processFile(filePath, options) {
  // 1. Detect file type
  const fileType = await detectFileType(filePath);

  // 2. Extract text based on type
  const extractedData = await parseByType(filePath, fileType);

  // 3. Clean and format text
  const cleanedData = await cleanText(extractedData);

  // 4. Split into chapters
  const chapters = await splitIntoChapters(cleanedData, options);

  // 5. Save to database
  const bookId = await saveChaptersToDB(chapters);

  return { bookId, chapters };
}
```

### 5. Crawler Service (Node.js)

**Purpose**: Web scraping and book downloading from online sources

**Key Components**:

- **Search Engine**: Anna's Archive integration
- **Download Manager**: Queue-based downloading with retry logic
- **Auto-Download**: Scheduled book discovery and download
- **Pipeline Manager**: End-to-end audiobook creation

**Search and Download Flow**:

```javascript
async function searchAndDownload(query, options) {
  // 1. Search for books
  const results = await searchBooks(query, options);

  // 2. Filter and rank results
  const filteredResults = await filterResults(results, options);

  // 3. Download selected books
  const downloadJobs = await queueDownloads(filteredResults);

  // 4. Monitor download progress
  const completedDownloads = await monitorDownloads(downloadJobs);

  // 5. Trigger parsing for completed downloads
  await triggerParsing(completedDownloads);

  return downloadJobs;
}
```

### 6. Queue Management System

**Purpose**: Reliable background job processing with Redis

**Queue Types**:

- **TTS Queue**: Text-to-speech generation jobs
- **Download Queue**: Book download jobs
- **Parse Queue**: File parsing jobs
- **Cleanup Queue**: File system maintenance

**Queue Configuration**:

```javascript
const queueConfig = {
  tts: {
    concurrency: 2,
    attempts: 5,
    backoff: "exponential",
    removeOnComplete: 100,
    removeOnFail: 50,
  },
  download: {
    concurrency: 3,
    attempts: 6,
    backoff: "exponential",
    removeOnComplete: 50,
    removeOnFail: 40,
  },
  parse: {
    concurrency: 4,
    attempts: 4,
    backoff: "exponential",
    removeOnComplete: 75,
    removeOnFail: 30,
  },
};
```

## Data Models

### Core Data Models

```typescript
interface Book {
  id: string;
  title: string;
  author: string;
  isbn?: string;
  filePath: string;
  fileType: "pdf" | "epub" | "txt";
  coverImage?: string;
  description?: string;
  language: string;
  totalChapters: number;
  status:
    | "downloaded"
    | "parsing"
    | "parsed"
    | "generating"
    | "ready"
    | "failed";
  createdAt: Date;
  updatedAt: Date;

  // Computed fields
  stats?: {
    totalChapters: number;
    audioChapters: number;
    processingChapters: number;
    totalDuration: number;
  };
}

interface Chapter {
  id: string;
  bookId: string;
  chapterNumber: number;
  title: string;
  textContent: string;
  audioPath?: string;
  duration?: number;
  status: "pending" | "processing" | "completed" | "failed";
  createdAt: Date;
  updatedAt: Date;
}

interface TTSJob {
  id: string;
  chapterId: string;
  bookId: string;
  text: string;
  title: string;
  voice: string;
  model: string;
  priority: number;
  status: "queued" | "processing" | "completed" | "failed";
  attempts: number;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

## Error Handling

### Error Categories and Responses

```typescript
enum ErrorType {
  VALIDATION = "VALIDATION_ERROR",
  NOT_FOUND = "NOT_FOUND",
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  RATE_LIMITED = "RATE_LIMITED",
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

interface ErrorResponse {
  success: false;
  error: {
    type: ErrorType;
    message: string;
    details?: any;
    requestId: string;
    timestamp: string;
  };
}
```

### Circuit Breaker Pattern

```javascript
const circuitBreakerConfig = {
  tts: {
    timeout: 300000, // 5 minutes
    errorThreshold: 5,
    resetTimeout: 60000, // 1 minute
  },
  parser: {
    timeout: 120000, // 2 minutes
    errorThreshold: 3,
    resetTimeout: 30000, // 30 seconds
  },
  crawler: {
    timeout: 60000, // 1 minute
    errorThreshold: 10,
    resetTimeout: 120000, // 2 minutes
  },
};
```

## Testing Strategy

### Unit Testing

- **Backend**: Jest with supertest for API testing
- **Frontend**: Jest + React Testing Library
- **TTS Service**: pytest with mocking
- **Parser Service**: Jest with file fixtures

### Integration Testing

- **Database**: Test with real PostgreSQL instance
- **Queue**: Test with Redis instance
- **File Operations**: Test with temporary directories
- **Service Communication**: Test inter-service calls

### End-to-End Testing

- **Complete Pipeline**: Upload → Parse → Generate → Stream
- **User Workflows**: Search → Download → Listen
- **Error Scenarios**: Service failures, network issues
- **Performance**: Load testing with multiple concurrent users

### Test Data Management

```javascript
const testFixtures = {
  books: {
    samplePDF: "./test/fixtures/sample.pdf",
    sampleEPUB: "./test/fixtures/sample.epub",
    largePDF: "./test/fixtures/large-book.pdf",
  },
  audio: {
    sampleMP3: "./test/fixtures/sample.mp3",
    longAudio: "./test/fixtures/long-chapter.mp3",
  },
  database: {
    seedData: "./test/fixtures/seed-data.sql",
    testUsers: "./test/fixtures/test-users.json",
  },
};
```

## Security Considerations

### Authentication & Authorization

- **JWT Tokens**: Secure token-based authentication
- **Role-Based Access**: Admin, User roles with different permissions
- **API Rate Limiting**: Prevent abuse and DoS attacks
- **Input Validation**: Comprehensive validation on all inputs

### Data Protection

- **File Upload Security**: Virus scanning, file type validation
- **SQL Injection Prevention**: Parameterized queries only
- **XSS Prevention**: Content Security Policy, input sanitization
- **CSRF Protection**: CSRF tokens for state-changing operations

### Infrastructure Security

- **Container Security**: Non-root users, minimal base images
- **Network Security**: Internal Docker networks, firewall rules
- **Secrets Management**: Environment variables, Docker secrets
- **SSL/TLS**: HTTPS everywhere, certificate management

## Performance Optimization

### Caching Strategy

```javascript
const cacheConfig = {
  levels: {
    L1: "memory", // In-process cache
    L2: "redis", // Distributed cache
    L3: "cdn", // CDN for static assets
  },
  ttl: {
    bookList: 300, // 5 minutes
    bookDetails: 600, // 10 minutes
    audioStream: 3600, // 1 hour
    searchResults: 900, // 15 minutes
  },
};
```

### Database Optimization

- **Indexes**: Strategic indexing on frequently queried columns
- **Connection Pooling**: Efficient database connection management
- **Query Optimization**: Analyze and optimize slow queries
- **Read Replicas**: Scale read operations

### File System Optimization

- **Audio Compression**: Optimal MP3 encoding settings
- **File Organization**: Hierarchical directory structure
- **Cleanup Jobs**: Automated cleanup of temporary files
- **CDN Integration**: Serve static files from CDN

## Monitoring and Observability

### Logging Strategy

```javascript
const logConfig = {
  levels: ["error", "warn", "info", "debug"],
  transports: {
    console: { level: "info" },
    file: { level: "error", filename: "error.log" },
    elasticsearch: { level: "warn", index: "audiobook-logs" },
  },
  structured: true,
  includeRequestId: true,
};
```

### Metrics Collection

- **Application Metrics**: Request rates, response times, error rates
- **Business Metrics**: Books processed, audio generated, user activity
- **Infrastructure Metrics**: CPU, memory, disk usage, network I/O
- **Queue Metrics**: Job counts, processing times, failure rates

### Health Checks

```javascript
const healthChecks = {
  database: () => pool.query("SELECT 1"),
  redis: () => redis.ping(),
  ttsService: () => axios.get("/health"),
  fileSystem: () => fs.access(audioPath),
  queue: () => queue.getWaitingCount(),
};
```

## Deployment Architecture

### Docker Compose Configuration

```yaml
version: "3.8"
services:
  frontend:
    build: ./frontend
    ports: ["3000:3000"]
    depends_on: [backend]

  backend:
    build: ./backend
    ports: ["5001:5000"]
    depends_on: [postgres, redis]

  tts-api:
    build: ./tts-api
    ports: ["8000:8000"]
    deploy:
      resources:
        limits: { memory: 4G }

  postgres:
    image: postgres:15-alpine
    volumes: [postgres_data:/var/lib/postgresql/data]

  redis:
    image: redis:7-alpine
    volumes: [redis_data:/data]

  nginx:
    image: nginx:alpine
    ports: ["80:80", "443:443"]
    volumes: [./nginx/nginx.conf:/etc/nginx/nginx.conf]
```

### Environment Configuration

```bash
# Database
DATABASE_URL=postgresql://user:pass@postgres:5432/audiobook_db
REDIS_URL=redis://redis:6379

# Services
TTS_API_URL=http://tts-api:8000
PARSER_SERVICE_URL=http://parser:3002
CRAWLER_SERVICE_URL=http://crawler:3001

# Storage
BOOKS_PATH=/books
AUDIO_PATH=/audio

# Security
JWT_SECRET=your-secret-key-here
ADMIN_PASSWORD=secure-admin-password
```

This design provides a robust, scalable, and maintainable architecture that addresses all the identified issues in the current system while providing a clear path for implementation and future enhancements.
