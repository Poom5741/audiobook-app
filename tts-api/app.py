import os
import asyncio
import logging
import tempfile
import shutil
from pathlib import Path
from typing import Optional, Dict, Any
import uuid
from datetime import datetime
import traceback

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import uvicorn
from dotenv import load_dotenv

from simple_tts_engine import SimpleTTSEngine
from simple_audio_utils import AudioProcessor
from file_manager import FileManager

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="SimpleTTS API",
    description="Text-to-Speech microservice using espeak for audiobook generation",
    version="1.0.0"
)

# Global instances
tts_engine: Optional[SimpleTTSEngine] = None
audio_processor: Optional[AudioProcessor] = None
file_manager: Optional[FileManager] = None

# Request/Response models
class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=50000, description="Text to convert to speech")
    book: str = Field(..., min_length=1, max_length=200, description="Book identifier")
    chapter: str = Field(..., min_length=1, max_length=50, description="Chapter identifier") 
    speaker: Optional[str] = Field("9017", description="Speaker ID (9017=female, 8051=male)")
    emotion: Optional[str] = Field("happy", description="Emotion: happy, sad, angry, neutral")
    speed: Optional[float] = Field(1.0, ge=0.5, le=2.0, description="Speech speed multiplier")

class TTSResponse(BaseModel):
    success: bool
    message: str
    audio_path: Optional[str] = None
    duration: Optional[float] = None
    file_size: Optional[int] = None
    processing_time: Optional[float] = None

class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    audio_path: str
    disk_space_gb: float
    memory_usage_mb: float
    gpu_available: bool
    available_speakers: list
    available_emotions: list

# Startup event
@app.on_event("startup")
async def startup_event():
    global tts_engine, audio_processor, file_manager
    
    try:
        logger.info("Starting EmotiVoice TTS microservice...")
        
        # Initialize components
        audio_path = os.getenv("AUDIO_PATH", "/audio")
        
        file_manager = FileManager(audio_path)
        audio_processor = AudioProcessor()
        tts_engine = SimpleTTSEngine()
        
        # Initialize TTS engine
        logger.info("Initializing SimpleTTS engine...")
        await tts_engine.initialize()
        
        logger.info("SimpleTTS microservice started successfully")
        
    except Exception as e:
        logger.error(f"Failed to start TTS service: {e}")
        logger.error(traceback.format_exc())
        raise

# Shutdown event
@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutting down SimpleTTS microservice...")
    
    if tts_engine:
        await tts_engine.cleanup()

# Health check endpoint
@app.get("/health", response_model=HealthResponse)
async def health_check():
    try:
        # Check system resources
        import psutil
        
        memory_info = psutil.virtual_memory()
        disk_info = psutil.disk_usage(file_manager.audio_path if file_manager else "/audio")
        
        # Check GPU availability
        gpu_available = False
        try:
            import torch
            gpu_available = torch.cuda.is_available()
        except:
            pass
        
        # Get available speakers and emotions
        speakers = tts_engine.get_available_speakers() if tts_engine else []
        emotions = tts_engine.get_available_emotions() if tts_engine else []
        
        return HealthResponse(
            status="healthy",
            model_loaded=tts_engine.is_loaded if tts_engine else False,
            audio_path=file_manager.audio_path if file_manager else "/audio",
            disk_space_gb=round(disk_info.free / (1024**3), 2),
            memory_usage_mb=round(memory_info.used / (1024**2), 2),
            gpu_available=gpu_available,
            available_speakers=speakers,
            available_emotions=emotions
        )
        
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=500, detail="Health check failed")

# Main TTS generation endpoint
@app.post("/tts", response_model=TTSResponse)
async def generate_tts(request: TTSRequest, background_tasks: BackgroundTasks):
    start_time = datetime.now()
    
    try:
        logger.info(f"Starting TTS generation for book: {request.book}, chapter: {request.chapter}")
        logger.info(f"Text length: {len(request.text)} characters")
        logger.info(f"Speaker: {request.speaker}, Emotion: {request.emotion}, Speed: {request.speed}")
        
        # Validate request
        if not tts_engine or not tts_engine.is_loaded:
            raise HTTPException(status_code=503, detail="TTS engine not ready")
        
        # Prepare output path
        audio_path = file_manager.get_chapter_path(request.book, request.chapter)
        
        # Ensure output directory exists
        audio_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Generate audio
        logger.info(f"Generating audio: {audio_path}")
        
        # Create temporary file for generation
        temp_audio_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_file:
                temp_audio_path = Path(temp_file.name)
            
            # Generate speech with EmotiVoice
            await tts_engine.generate_speech(
                text=request.text,
                output_path=temp_audio_path,
                speaker=request.speaker,
                emotion=request.emotion,
                speed=request.speed
            )
            
            # Process and convert audio to MP3
            final_audio_path = await audio_processor.process_audio(
                input_path=temp_audio_path,
                output_path=audio_path,
                quality="standard"
            )
            
            # Get file info
            file_size = final_audio_path.stat().st_size
            duration = await audio_processor.get_duration(final_audio_path)
            
            # Calculate processing time
            processing_time = (datetime.now() - start_time).total_seconds()
            
            logger.info(f"TTS generation completed: {final_audio_path}")
            logger.info(f"Duration: {duration}s, Size: {file_size} bytes, Time: {processing_time}s")
            
            # Clean up temp file in background
            if temp_audio_path and temp_audio_path.exists():
                background_tasks.add_task(cleanup_temp_file, temp_audio_path)
            
            # Return relative path for API consumption
            relative_path = f"{request.book}/chapter-{request.chapter}.mp3"
            
            return TTSResponse(
                success=True,
                message="TTS generation completed successfully",
                audio_path=relative_path,
                duration=duration,
                file_size=file_size,
                processing_time=processing_time
            )
            
        except Exception as e:
            # Clean up temp file on error
            if temp_audio_path and temp_audio_path.exists():
                try:
                    temp_audio_path.unlink()
                except:
                    pass
            raise e
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"TTS generation failed: {e}")
        logger.error(traceback.format_exc())
        processing_time = (datetime.now() - start_time).total_seconds()
        
        return TTSResponse(
            success=False,
            message=f"TTS generation failed: {str(e)}",
            processing_time=processing_time
        )

# Get available speakers and emotions
@app.get("/speakers")
async def get_speakers():
    try:
        if not tts_engine:
            raise HTTPException(status_code=503, detail="TTS engine not ready")
        
        return {
            "speakers": tts_engine.get_available_speakers(),
            "emotions": tts_engine.get_available_emotions(),
            "default_speaker": "9017",
            "default_emotion": "happy"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get speakers: {e}")
        raise HTTPException(status_code=500, detail="Failed to get available speakers")

# Get audio file info
@app.get("/audio/{book}/{chapter}/info")
async def get_audio_info(book: str, chapter: str):
    try:
        audio_path = file_manager.get_chapter_path(book, chapter)
        
        if not audio_path.exists():
            raise HTTPException(status_code=404, detail="Audio file not found")
        
        file_size = audio_path.stat().st_size
        duration = await audio_processor.get_duration(audio_path)
        
        return {
            "exists": True,
            "path": f"{book}/chapter-{chapter}.mp3",
            "size": file_size,
            "duration": duration,
            "created": audio_path.stat().st_ctime,
            "modified": audio_path.stat().st_mtime
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get audio info: {e}")
        raise HTTPException(status_code=500, detail="Failed to get audio info")

# Delete audio file
@app.delete("/audio/{book}/{chapter}")
async def delete_audio(book: str, chapter: str):
    try:
        audio_path = file_manager.get_chapter_path(book, chapter)
        
        if not audio_path.exists():
            raise HTTPException(status_code=404, detail="Audio file not found")
        
        audio_path.unlink()
        logger.info(f"Deleted audio file: {audio_path}")
        
        return {"success": True, "message": "Audio file deleted"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete audio: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete audio file")

# Cleanup function
async def cleanup_temp_file(file_path: Path):
    try:
        if file_path.exists():
            file_path.unlink()
            logger.debug(f"Cleaned up temp file: {file_path}")
    except Exception as e:
        logger.warning(f"Failed to cleanup temp file {file_path}: {e}")

# Error handlers
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {exc}")
    logger.error(traceback.format_exc())
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)}
    )

if __name__ == "__main__":
    port = int(os.getenv("TTS_PORT", 8000))
    host = os.getenv("TTS_HOST", "0.0.0.0")
    
    uvicorn.run(
        "app:app",
        host=host,
        port=port,
        reload=False,
        log_level="info"
    )