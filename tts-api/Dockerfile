# Multi-stage Dockerfile for EmotiVoice TTS API
FROM python:3.10-slim AS base

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV TTS_PORT=8000
ENV TTS_HOST=0.0.0.0
ENV AUDIO_PATH=/audio

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    espeak \
    espeak-data \
    git \
    wget \
    curl \
    build-essential \
    cmake \
    pkg-config \
    libsndfile1-dev \
    libasound2-dev \
    portaudio19-dev \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd --create-home --shell /bin/bash tts

# Set working directory
WORKDIR /app

# Copy requirements first for better Docker layer caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir torch torchaudio --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create audio directory and set permissions
RUN mkdir -p /audio && \
    chown -R tts:tts /app /audio

# Download EmotiVoice models (optional - they'll be downloaded on first use)
USER tts
RUN python -c "\
try:\
    import torch;\
    print('PyTorch installed successfully');\
    print(f'CUDA available: {torch.cuda.is_available()}');\
except Exception as e:\
    print(f'PyTorch check failed: {e}');\
" || true

# Switch back to root for final setup
USER root

# Install additional dependencies for EmotiVoice
RUN pip install --no-cache-dir \
    torchaudio \
    librosa \
    soundfile \
    phonemizer \
    pypinyin \
    jieba \
    cn2an \
    inflect

# Set proper permissions
RUN chown -R tts:tts /app /audio

# Switch to non-root user
USER tts

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Start the application
CMD ["python", "app.py"]