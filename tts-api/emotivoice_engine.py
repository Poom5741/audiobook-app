import logging
import asyncio
import re
from pathlib import Path
from typing import Optional, List, Dict
import subprocess
import tempfile
import os
import numpy as np
import soundfile as sf
import librosa
import traceback

logger = logging.getLogger(__name__)

class EmotiVoiceEngine:
    def __init__(self):
        self.is_loaded = False
        self.sample_rate = 22050  # Standard for espeak
        self.max_text_length = 500  # Maximum characters per synthesis
        self.fallback_mode = "none"
        
        logger.info("EmotiVoice Engine initialized (espeak fallback only)")
    
    async def load_models(self):
        """Load the TTS models (espeak fallback only)"""
        try:
            logger.info("Setting up espeak fallback...")
            result = subprocess.run(['espeak', '--version'], 
                                  capture_output=True, text=True)
            if result.returncode == 0:
                self.fallback_mode = "espeak"
                self.is_loaded = True
                logger.info("espeak available and set as fallback TTS")
            else:
                logger.warning("espeak not found, no TTS fallback available")
        except FileNotFoundError:
            logger.warning("espeak not found, no TTS fallback available")
        except Exception as e:
            logger.error(f"Failed to set up espeak fallback: {e}")
            logger.error(traceback.format_exc())
            raise
    
    async def generate_speech(
        self, 
        text: str, 
        output_path: Path, 
        speaker: str = "default",
        emotion: str = "neutral",
        speed: float = 1.0
    ):
        """Generate speech from text using espeak fallback"""
        try:
            if not self.is_loaded or self.fallback_mode != "espeak":
                raise RuntimeError("TTS engine not loaded or espeak not available")
            
            cleaned_text = self._clean_text(text)
            chunks = self._split_text(cleaned_text)
            
            logger.info(f"Generating speech for {len(chunks)} text chunks using espeak")
            
            audio_arrays = []
            for i, chunk in enumerate(chunks):
                logger.debug(f"Processing chunk {i+1}/{len(chunks)}: {len(chunk)} chars")
                audio_array = await asyncio.get_event_loop().run_in_executor(
                    None, self._generate_with_espeak, chunk, speed
                )
                if audio_array is not None and len(audio_array) > 0:
                    audio_arrays.append(audio_array)
                    if i < len(chunks) - 1:
                        pause_samples = int(0.3 * self.sample_rate)
                        pause = np.zeros(pause_samples, dtype=np.float32)
                        audio_arrays.append(pause)
            
            if audio_arrays:
                final_audio = np.concatenate(audio_arrays)
                final_audio = self._normalize_audio(final_audio)
                sf.write(
                    str(output_path), 
                    final_audio, 
                    self.sample_rate,
                    format='WAV',
                    subtype='PCM_16'
                )
                logger.info(f"Audio saved to: {output_path}")
            else:
                raise RuntimeError("No audio generated")
                
        except Exception as e:
            logger.error(f"Speech generation failed: {e}")
            logger.error(traceback.format_exc())
            raise
    
    def _generate_with_espeak(self, text: str, speed: float) -> np.ndarray:
        """Generate audio using espeak"""
        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_file:
                temp_path = temp_file.name
            
            speed_wpm = int(175 * speed)
            
            cmd = [
                'espeak', 
                '-s', str(speed_wpm),
                '-w', temp_path,
                text
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode == 0:
                audio, sr = sf.read(temp_path)
                if sr != self.sample_rate:
                    audio = librosa.resample(audio, orig_sr=sr, target_sr=self.sample_rate)
                os.unlink(temp_path)
                return audio.astype(np.float32)
            else:
                logger.error(f"espeak failed: {result.stderr}")
                os.unlink(temp_path)
                return np.zeros(int(2 * self.sample_rate), dtype=np.float32)
                
        except Exception as e:
            logger.error(f"espeak generation failed: {e}")
            return np.zeros(int(2 * self.sample_rate), dtype=np.float32)
    
    def _clean_text(self, text: str) -> str:
        """Clean and prepare text for TTS"""
        text = re.sub(r'\s+', ' ', text.strip())
        text = re.sub(r'[^\w\s.,!?;:\'\"()\-]', '', text) # Removed Chinese characters
        text = re.sub(r'([.!?])\s*([A-Z])', r'\1 \2', text)
        if text and text[-1] not in '.!?': # Removed Chinese punctuation
            text += '.'
        return text
    
    def _split_text(self, text: str) -> List[str]:
        """Split text into chunks suitable for espeak"""
        sentences = re.split(r'(?<=[.!?])\s+', text) # Removed Chinese punctuation
        
        chunks = []
        current_chunk = ""
        
        for sentence in sentences:
            if len(current_chunk) + len(sentence) > self.max_text_length and current_chunk:
                chunks.append(current_chunk.strip())
                current_chunk = sentence
            else:
                current_chunk += " " + sentence if current_chunk else sentence
        
        if current_chunk.strip():
            chunks.append(current_chunk.strip())
        
        if not chunks:
            for i in range(0, len(text), self.max_text_length):
                chunk = text[i:i + self.max_text_length]
                chunks.append(chunk)
        
        return chunks
    
    def _normalize_audio(self, audio: np.ndarray) -> np.ndarray:
        """Normalize audio to prevent clipping"""
        audio = audio - np.mean(audio)
        max_val = np.max(np.abs(audio))
        if max_val > 0:
            audio = audio * (0.9 / max_val)
        return audio
    
    async def cleanup(self):
        """Clean up resources"""
        logger.info("EmotiVoice engine cleaned up")
    
    def get_speaker_info(self) -> Dict[str, str]:
        """Get speaker information (placeholder for espeak)"""
        return {"default": "default_espeak_voice"}
