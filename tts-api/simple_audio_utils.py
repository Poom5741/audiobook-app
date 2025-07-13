import logging
import asyncio
from pathlib import Path
from typing import Optional
import subprocess

logger = logging.getLogger(__name__)

class AudioProcessor:
    def __init__(self):
        self.sample_rate = 22050  # Standard for web audio
    
    async def process_audio(
        self, 
        input_path: Path, 
        output_path: Path, 
        quality: str = "standard"
    ) -> Path:
        """Process and convert audio file using ffmpeg"""
        try:
            logger.debug(f"Processing audio: {input_path} -> {output_path}")
            
            # Ensure output directory exists
            output_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Use ffmpeg for audio conversion
            cmd = [
                'ffmpeg', '-y',  # Overwrite output
                '-i', str(input_path),
                '-ar', str(self.sample_rate),  # Set sample rate
                '-ac', '1',  # Mono
                '-b:a', '128k',  # Bitrate
                '-f', 'mp3',  # Output format
                str(output_path)
            ]
            
            result = subprocess.run(
                cmd, 
                capture_output=True, 
                text=True,
                timeout=60
            )
            
            if result.returncode == 0:
                logger.info(f"Audio processed successfully: {output_path}")
                return output_path
            else:
                # If ffmpeg fails, try simple copy
                logger.warning(f"ffmpeg failed, trying simple copy: {result.stderr}")
                return await self._simple_copy(input_path, output_path)
                
        except Exception as e:
            logger.error(f"Error processing audio: {e}")
            # Fallback to simple copy
            return await self._simple_copy(input_path, output_path)
    
    async def _simple_copy(self, input_path: Path, output_path: Path) -> Path:
        """Simple file copy as fallback"""
        try:
            import shutil
            shutil.copy2(input_path, output_path)
            logger.info(f"Audio copied: {output_path}")
            return output_path
        except Exception as e:
            logger.error(f"Error copying audio: {e}")
            raise
    
    async def get_duration(self, audio_path: Path) -> float:
        """Get audio file duration in seconds"""
        try:
            if not audio_path.exists():
                return 0.0
                
            # Try to get duration with ffprobe
            cmd = [
                'ffprobe', '-v', 'quiet',
                '-show_entries', 'format=duration',
                '-of', 'default=noprint_wrappers=1:nokey=1',
                str(audio_path)
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            
            if result.returncode == 0 and result.stdout.strip():
                return float(result.stdout.strip())
            else:
                logger.warning(f"Could not get duration for {audio_path}")
                return 0.0
                
        except Exception as e:
            logger.error(f"Error getting audio duration: {e}")
            return 0.0

    async def get_audio_info(self, file_path: Path) -> dict:
        """Get basic audio file information"""
        try:
            if not file_path.exists():
                return {"duration": 0, "size": 0}
                
            size = file_path.stat().st_size
            duration = await self.get_duration(file_path)
                
            return {
                "duration": duration,
                "size": size,
                "sample_rate": self.sample_rate,
                "format": "mp3"
            }
            
        except Exception as e:
            logger.error(f"Error getting audio info: {e}")
            return {"duration": 0, "size": 0}