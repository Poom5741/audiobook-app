#!/usr/bin/env python3

import os
import tempfile
import logging
from pathlib import Path
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import uvicorn

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="EmotiVoice TTS API",
    description="Text-to-Speech microservice using EmotiVoice for audiobook generation",
    version="1.0.0"
)

# Request/Response models
class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=50000, description="Text to convert to speech")
    book: str = Field(..., min_length=1, max_length=200, description="Book identifier")
    chapter: str = Field(..., min_length=1, max_length=50, description="Chapter identifier") 
    speaker: str = Field("9017", description="Speaker ID (9017=female, 8051=male)")
    emotion: str = Field("happy", description="Emotion: happy, sad, angry, neutral")
    speed: float = Field(1.0, ge=0.5, le=2.0, description="Speech speed multiplier")

class TTSResponse(BaseModel):
    success: bool
    message: str
    audio_path: str = None
    duration: float = None
    file_size: int = None
    processing_time: float = None

class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    audio_path: str
    available_speakers: list
    available_emotions: list

@app.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(
        status="healthy",
        model_loaded=True,  # Mock for now
        audio_path="./audio",
        available_speakers=["9017", "8051"],
        available_emotions=["happy", "sad", "angry", "neutral"]
    )

@app.post("/tts", response_model=TTSResponse)
async def generate_tts(request: TTSRequest):
    try:
        logger.info(f"TTS request: book={request.book}, chapter={request.chapter}")
        logger.info(f"Text length: {len(request.text)} chars")
        
        # Create audio directory structure
        audio_dir = Path("./audio") / request.book
        audio_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate output path
        audio_path = audio_dir / f"chapter-{request.chapter}.mp3"
        
        # Mock TTS generation - create empty file for now
        with open(audio_path, 'w') as f:
            f.write("")
        
        return TTSResponse(
            success=True,
            message="TTS generation completed successfully",
            audio_path=f"{request.book}/chapter-{request.chapter}.mp3",
            duration=5.0,  # Mock duration
            file_size=1024,  # Mock file size
            processing_time=2.0  # Mock processing time
        )
        
    except Exception as e:
        logger.error(f"TTS generation failed: {e}")
        return TTSResponse(
            success=False,
            message=f"TTS generation failed: {str(e)}"
        )

@app.get("/speakers")
async def get_speakers():
    return {
        "speakers": ["9017", "8051"],
        "emotions": ["happy", "sad", "angry", "neutral"],
        "default_speaker": "9017",
        "default_emotion": "happy"
    }

if __name__ == "__main__":
    port = int(os.getenv("TTS_PORT", 8000))
    host = os.getenv("TTS_HOST", "0.0.0.0")
    
    logger.info("Starting EmotiVoice TTS API (test mode)...")
    uvicorn.run(
        "simple_test:app",
        host=host,
        port=port,
        reload=False,
        log_level="info"
    )