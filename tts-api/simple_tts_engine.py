import os
import logging
import asyncio
import subprocess
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

class SimpleTTSEngine:
    """Lightweight TTS engine using espeak as fallback."""
    
    def __init__(self):
        self.initialized = False
        
    async def initialize(self):
        """Initialize the TTS engine."""
        try:
            # Check if espeak is available
            result = subprocess.run(['espeak', '--version'], 
                                  capture_output=True, text=True)
            if result.returncode == 0:
                self.initialized = True
                logger.info("SimpleTTS engine initialized with espeak")
            else:
                raise Exception("espeak not available")
                
        except Exception as e:
            logger.error(f"Failed to initialize TTS engine: {e}")
            self.initialized = False
            
    async def generate_speech(self, 
                            text: str, 
                            output_path: Path,
                            speaker: str = "default",
                            emotion: str = "neutral",
                            speed: float = 1.0) -> bool:
        """Generate speech from text using espeak."""
        try:
            if not self.initialized:
                await self.initialize()
                
            if not self.initialized:
                raise Exception("TTS engine not initialized")
                
            # Clean text
            clean_text = self._clean_text(text)
            
            # Generate speech with espeak
            cmd = [
                'espeak',
                '-s', str(int(150 * speed)),  # Speed in words per minute
                '-a', '200',  # Amplitude
                '-w', str(output_path),  # Output to wav file
                clean_text
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode == 0:
                logger.info(f"Generated speech: {output_path}")
                return True
            else:
                logger.error(f"espeak failed: {result.stderr}")
                return False
                
        except Exception as e:
            logger.error(f"Error generating speech: {e}")
            return False
            
    def _clean_text(self, text: str) -> str:
        """Clean text for TTS processing."""
        # Remove excessive whitespace
        text = ' '.join(text.split())
        
        # Limit length to prevent very long synthesis
        if len(text) > 500:
            text = text[:500] + "..."
            
        return text
        
    async def cleanup(self):
        """Cleanup resources."""
        pass
        
    def get_available_speakers(self) -> list:
        """Get list of available speakers."""
        return ["default", "espeak"]
        
    def get_available_emotions(self) -> list:
        """Get list of available emotions."""
        return ["neutral", "default"]