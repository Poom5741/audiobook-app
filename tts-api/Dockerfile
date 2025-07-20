# Lightweight TTS API with fallback to espeak
FROM python:3.10-slim AS base

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV TTS_PORT=8000
ENV TTS_HOST=0.0.0.0
ENV AUDIO_PATH=/audio

# Install minimal system dependencies
RUN apt-get update && apt-get install -y     ffmpeg     espeak     espeak-data     curl     && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd --create-home --shell /bin/bash tts

# Set working directory
WORKDIR /app

# Copy requirements first for better Docker layer caching
COPY requirements.txt .

# Install minimal Python dependencies (espeak-based fallback)
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir fastapi uvicorn pydantic python-multipart pydub requests python-dotenv aiofiles psutil numpy scipy librosa soundfile transformers phonemizer pypinyin jieba cn2an inflect

# Copy application code
COPY . .

# Create audio directory and set permissions
RUN mkdir -p /audio &&     chown -R tts:tts /app /audio

# Switch to non-root user
USER tts

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3     CMD curl -f http://localhost:8000/health || exit 1

# Start the application
CMD ["python", "app.py"]