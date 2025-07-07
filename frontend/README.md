# Audiobook Frontend

A minimal Next.js frontend for the self-hosted audiobook system with streaming audio playback and progress tracking.

## Features

### 🎧 Core Functionality
- **Book Library**: Browse available audiobooks
- **Chapter Navigation**: View and select chapters
- **Audio Streaming**: HTML5 player with backend audio streaming
- **Progress Tracking**: Resume playback from last position using localStorage
- **Playback Controls**: Play/pause, seek, volume, speed (0.5x - 2x)

### 📱 User Experience  
- **Responsive Design**: Works on desktop and mobile
- **Real-time Status**: Shows audio availability and generation progress
- **Chapter Auto-advance**: Automatically moves to next chapter when current finishes
- **Keyboard Shortcuts**: Standard audio player controls
- **Loading States**: Clear feedback during operations

### 💾 Data Persistence
- **Playback Position**: Saves current time and resumes on reload
- **Book Progress**: Tracks completed chapters and current position
- **User Preferences**: Remembers volume and playback speed settings
- **Recent Books**: Shows recently accessed books with progress

## Pages

### `/` - Book Library
- Lists all available books
- Shows progress indicators
- Recently accessed books highlighted
- Book metadata (chapters, duration, author)

### `/book/[slug]` - Book Player
- Chapter list with audio status
- Integrated audio player
- Chapter navigation
- Audio generation triggers

## API Integration

Connects to backend Express.js API:

```typescript
GET /api/books                    // List all books
GET /api/books/:slug              // Get book details  
GET /api/books/:slug/chapters     // Get chapter list
GET /api/audio/:slug/:chapter     // Stream audio file
GET /api/audio/:slug/:chapter/info // Get audio metadata
POST /api/generate/:slug/:chapter  // Trigger TTS generation
```

## Audio Player Features

### Playback Controls
- **Play/Pause**: Standard playback control
- **Seeking**: Click/drag progress bar to jump to position
- **Chapter Navigation**: Previous/next chapter buttons
- **Skip**: 30-second forward/backward buttons

### Settings
- **Volume**: 0-100% with visual indicator
- **Speed**: 0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x
- **Position Tracking**: Auto-saves every 5 seconds during playback

### Progress Management
- **Resume Playback**: Automatically resumes from last position
- **Chapter Completion**: Marks chapters complete when finished
- **Book Progress**: Tracks overall reading progress

## Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open http://localhost:3000
```

## Production Build

```bash
# Build for production
npm run build

# Start production server  
npm start
```

## Docker Deployment

```bash
# Build container
docker build -t audiobook-frontend .

# Run container
docker run -p 3000:3000 audiobook-frontend

# Or use docker-compose
docker-compose up frontend
```

## Environment Variables

```env
NODE_ENV=production
NEXT_PUBLIC_API_URL=http://localhost:5001
PORT=3000
HOSTNAME=0.0.0.0
```

## Project Structure

```
frontend/
├── app/                    # Next.js 13+ app directory
│   ├── layout.tsx         # Root layout with navigation
│   ├── page.tsx           # Home page (book list)
│   ├── book/[slug]/       # Dynamic book pages
│   │   └── page.tsx       # Book detail with player
│   └── globals.css        # Global styles
├── components/
│   └── AudioPlayer.tsx    # Audio player component
├── lib/
│   ├── api.ts            # API client functions
│   └── storage.ts        # localStorage utilities
├── public/               # Static assets
├── Dockerfile           # Container configuration
├── next.config.js       # Next.js configuration
├── package.json         # Dependencies
└── test-frontend.js     # Test script
```

## Browser Support

- **Modern Browsers**: Chrome 88+, Firefox 85+, Safari 14+
- **HTML5 Audio**: Required for audio playback
- **localStorage**: Required for progress tracking
- **CSS Grid/Flexbox**: For responsive layout

## Testing

```bash
# Test frontend server
node test-frontend.js

# Manual testing checklist:
# ✅ Book list loads and displays correctly
# ✅ Book page shows chapters and player
# ✅ Audio streams and controls work
# ✅ Progress saves and resumes correctly
# ✅ Chapter navigation functions
# ✅ Settings persist between sessions
```

## Integration Points

### Backend API
- Proxies `/api/*` requests to backend on port 5001
- Handles authentication and data fetching
- Serves audio files with range request support

### TTS Service
- Triggers audio generation via backend
- Shows generation status in real-time
- Handles audio availability checks

### Storage
- Uses localStorage for client-side data
- Syncs with backend for book/chapter metadata
- Persists user preferences and progress

## Troubleshooting

### Common Issues

**Audio won't play:**
- Check backend is running on port 5001
- Verify audio file exists in `/audio/{book}/chapter-{chapter}.mp3`
- Check browser console for CORS or network errors

**Progress not saving:**
- Verify localStorage is enabled in browser
- Check for localStorage quota exceeded
- Test with browser dev tools

**API calls failing:**
- Ensure backend service is accessible
- Check Next.js proxy configuration in `next.config.js`
- Verify environment variables are set correctly

## Future Enhancements

- [ ] Offline playback support
- [ ] Playlist management
- [ ] Audio visualization
- [ ] Keyboard shortcuts
- [ ] Dark mode theme
- [ ] Accessibility improvements
- [ ] Mobile app (React Native)

---

## Contributing

This frontend integrates with the complete audiobook system:
- **Crawler**: Downloads books
- **Parser**: Extracts text 
- **TTS API**: Generates audio
- **Backend**: Orchestrates services
- **Frontend**: Provides user interface

Ready for audio streaming! 🎧