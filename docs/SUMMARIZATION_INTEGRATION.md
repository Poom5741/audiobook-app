# Summarization Integration Guide

## Overview

The TTS queue service has been updated to support optional text summarization before audio generation. This feature allows users to create shorter, more focused audiobooks by summarizing chapter content before converting it to speech.

## Key Components

### 1. Updated Queue Service (`/backend/src/services/queueService.js`)

**New Features:**
- Added `summarize` and `summarizeOptions` parameters to job data
- Integrated summarization step in the TTS processing pipeline
- Added fallback handling if summarization fails
- Enhanced job return data with summarization metrics

**Process Flow:**
1. Check if summarization is enabled for the job
2. If enabled, call the summarization service
3. Process the summarized text (or original text if summarization fails)
4. Continue with normal TTS generation
5. Return enhanced metrics including summarization data

### 2. Updated TTS Routes (`/backend/src/routes/tts.js`)

**New Endpoints:**
- `POST /api/tts/summarize` - Test summarization for given text
- `GET /api/tts/summarize/health` - Check summarization service health

**Updated Endpoints:**
- `POST /api/tts/generate/:bookId` - Now accepts summarization options
- `POST /api/tts/generate/:bookId/:chapterId` - Now accepts summarization options

**New Parameters:**
- `summarize`: Boolean flag to enable/disable summarization
- `summarizeOptions`: Object containing summarization settings
  - `style`: 'concise' | 'detailed' | 'bullets' | 'key-points'
  - `maxLength`: Maximum summary length (100-2000 characters)
  - `contentType`: 'general' | 'instructional' | 'analytical' | 'narrative' | 'howto'

### 3. Environment Configuration

**New Environment Variables:**
- `TTS_API_URL`: URL for the TTS service (default: http://tts:8000)
- `SUMMARIZER_API_URL`: URL for the summarization service (default: http://summarizer:8001)

## Usage Examples

### 1. Generate Audio with Summarization (Entire Book)

```bash
curl -X POST http://localhost:5000/api/tts/generate/BOOK_ID \
  -H "Content-Type: application/json" \
  -d '{
    "voice": "default",
    "model": "bark",
    "priority": 0,
    "summarize": true,
    "summarizeOptions": {
      "style": "concise",
      "maxLength": 500,
      "contentType": "narrative"
    }
  }'
```

### 2. Generate Audio with Summarization (Single Chapter)

```bash
curl -X POST http://localhost:5000/api/tts/generate/BOOK_ID/CHAPTER_ID \
  -H "Content-Type: application/json" \
  -d '{
    "voice": "default",
    "model": "bark",
    "summarize": true,
    "summarizeOptions": {
      "style": "key-points",
      "maxLength": 300,
      "contentType": "instructional"
    }
  }'
```

### 3. Test Summarization

```bash
curl -X POST http://localhost:5000/api/tts/summarize \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Your long text here...",
    "style": "concise",
    "maxLength": 200,
    "contentType": "narrative"
  }'
```

### 4. Check Summarization Health

```bash
curl http://localhost:5000/api/tts/summarize/health
```

## Summarization Options

### Styles
- **concise**: Brief, essential points only
- **detailed**: Comprehensive but condensed
- **bullets**: Bullet-point format
- **key-points**: Numbered key takeaways

### Content Types
- **general**: General purpose content
- **instructional**: How-to and educational content
- **analytical**: Analysis and research content
- **narrative**: Stories and narrative content
- **howto**: Step-by-step instructions

### Length Control
- **maxLength**: 100-2000 characters
- Default: 500 characters

## Error Handling

The integration includes robust error handling:

1. **Summarization Service Unavailable**: Falls back to original text
2. **Summarization Timeout**: Falls back to original text after 60 seconds
3. **Invalid Response**: Falls back to original text
4. **Network Errors**: Falls back to original text

All errors are logged but don't prevent TTS generation from proceeding.

## Performance Considerations

- Summarization adds ~5-30 seconds to processing time per chapter
- Progress tracking is updated to account for summarization step
- Original text is preserved for fallback scenarios
- Compression ratios are tracked and reported

## Testing

Use the provided test script to verify the integration:

```bash
cd backend
node test-summarization.js
```

This script tests:
1. Direct summarizer service connectivity
2. Health check endpoint
3. Summarization API integration

## Monitoring

The integration provides additional logging:
- Summarization attempts and results
- Compression ratios achieved
- Fallback scenarios
- Performance metrics

Check logs for entries like:
- "Summarizing text for chapter: [title]"
- "Text summarized: [original_length] → [summary_length] chars"
- "Summarization failed, using original text"

## Dependencies

The integration requires:
- Summarization service running on port 8001
- Ollama or compatible LLM service for summarization
- Network connectivity between backend and summarization service

## Future Enhancements

Potential improvements:
1. Batch summarization for multiple chapters
2. User-specific summarization preferences
3. A/B testing for summarization effectiveness
4. Integration with different summarization providers
5. Caching of summarization results