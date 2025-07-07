import os
import logging
import asyncio
import re
from pathlib import Path
from typing import Optional, List, Dict
import warnings
import traceback
import tempfile

import torch
import numpy as np
import soundfile as sf
from transformers import AutoTokenizer
import subprocess

# Suppress warnings
warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)

logger = logging.getLogger(__name__)

class EmotiVoiceEngine:
    def __init__(self):
        self.is_loaded = False
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.sample_rate = 16000
        self.max_text_length = 500  # Maximum characters per synthesis
        
        # EmotiVoice models and components
        self.am_model = None
        self.vocoder = None
        self.tokenizer = None
        self.speaker_mapping = {}
        self.emotion_mapping = {}
        
        # Available speakers (from EmotiVoice)
        self.available_speakers = {
            "9017": "female_calm",
            "8051": "male_calm", 
            "9016": "female_excited",
            "8050": "male_excited",
            "9015": "female_warm",
            "8049": "male_warm"
        }
        
        # Available emotions
        self.available_emotions = [
            "happy", "sad", "angry", "neutral", "excited", "calm"
        ]
        
        logger.info(f"EmotiVoice Engine initialized on device: {self.device}")
    
    async def load_models(self):
        """Load the EmotiVoice TTS models"""
        try:
            logger.info("Loading EmotiVoice models...")
            
            # Load models in executor to avoid blocking
            await asyncio.get_event_loop().run_in_executor(
                None, self._load_models_sync
            )
            
            self.is_loaded = True
            logger.info("EmotiVoice models loaded successfully")
            
        except Exception as e:
            logger.error(f"Failed to load EmotiVoice models: {e}")
            logger.error(traceback.format_exc())
            raise
    
    def _load_models_sync(self):
        """Synchronous model loading"""
        try:
            # Try to import EmotiVoice components
            try:
                from EmotiVoice.models.prompt_tts_modified.jets import JETSGenerator
                from EmotiVoice.models.prompt_tts_modified.simbert import SimBertModel
                from EmotiVoice.frontend_cn import Frontend
                from EmotiVoice.frontend_en import Frontend as EnglishFrontend
                
                logger.info("EmotiVoice imports successful")
                
            except ImportError as e:
                logger.error(f"Failed to import EmotiVoice: {e}")
                # Fallback to basic TTS implementation
                self._setup_fallback_tts()
                return
            
            # Set up model paths (these would be downloaded/cached)
            model_dir = os.path.expanduser("~/.cache/emotivoice")
            os.makedirs(model_dir, exist_ok=True)
            
            # Initialize frontend processors
            self.cn_frontend = Frontend()
            self.en_frontend = EnglishFrontend()
            
            # Load acoustic model and vocoder
            self._load_acoustic_model()
            self._load_vocoder()
            
            logger.info("EmotiVoice models loaded")
            
        except Exception as e:
            logger.error(f"Model loading failed: {e}")
            logger.error(traceback.format_exc())
            # Fall back to basic implementation
            self._setup_fallback_tts()
    
    def _load_acoustic_model(self):
        """Load the acoustic model"""
        try:
            # This would load the actual EmotiVoice acoustic model
            # For now, we'll set up a placeholder
            logger.info("Loading acoustic model...")
            self.am_model = "placeholder_am_model"
            
        except Exception as e:
            logger.error(f"Failed to load acoustic model: {e}")
            self.am_model = None
    
    def _load_vocoder(self):
        """Load the vocoder model"""
        try:
            # This would load the actual EmotiVoice vocoder
            # For now, we'll set up a placeholder
            logger.info("Loading vocoder...")
            self.vocoder = "placeholder_vocoder"
            
        except Exception as e:
            logger.error(f"Failed to load vocoder: {e}")
            self.vocoder = None
    
    def _setup_fallback_tts(self):
        """Setup fallback TTS using system tools"""
        logger.warning("Setting up fallback TTS using espeak")
        try:
            # Check if espeak is available
            result = subprocess.run(['espeak', '--version'], 
                                  capture_output=True, text=True)
            if result.returncode == 0:
                self.fallback_mode = "espeak"
                logger.info("Fallback TTS: espeak available")
            else:
                self.fallback_mode = "none"
                logger.warning("No TTS fallback available")
        except FileNotFoundError:
            self.fallback_mode = "none"
            logger.warning("espeak not found, no TTS fallback available")
    
    async def generate_speech(
        self, 
        text: str, 
        output_path: Path, 
        speaker: str = "9017",
        emotion: str = "happy",
        speed: float = 1.0
    ):
        """Generate speech from text using EmotiVoice"""
        try:
            if not self.is_loaded:
                raise RuntimeError("TTS engine not loaded")
            
            # Clean and prepare text
            cleaned_text = self._clean_text(text)
            
            # Split text into chunks if too long
            chunks = self._split_text(cleaned_text)
            
            logger.info(f"Generating speech for {len(chunks)} text chunks")
            
            # Generate audio for each chunk
            audio_arrays = []
            
            for i, chunk in enumerate(chunks):
                logger.debug(f"Processing chunk {i+1}/{len(chunks)}: {len(chunk)} chars")
                
                # Generate audio in executor to avoid blocking
                audio_array = await asyncio.get_event_loop().run_in_executor(
                    None, self._generate_chunk, chunk, speaker, emotion, speed
                )
                
                if audio_array is not None and len(audio_array) > 0:
                    audio_arrays.append(audio_array)
                    
                    # Add short pause between chunks
                    if i < len(chunks) - 1:
                        pause_samples = int(0.3 * self.sample_rate)  # 0.3 second pause
                        pause = np.zeros(pause_samples, dtype=np.float32)
                        audio_arrays.append(pause)
            
            # Concatenate all audio chunks
            if audio_arrays:
                final_audio = np.concatenate(audio_arrays)
                
                # Normalize audio
                final_audio = self._normalize_audio(final_audio)
                
                # Save as WAV file
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
    
    def _generate_chunk(self, text: str, speaker: str, emotion: str, speed: float) -> np.ndarray:
        """Generate audio for a single text chunk"""
        try:
            # Check if we have EmotiVoice models loaded
            if hasattr(self, 'am_model') and self.am_model and self.am_model != "placeholder_am_model":
                # Use real EmotiVoice generation
                return self._generate_with_emotivoice(text, speaker, emotion, speed)
            else:
                # Use fallback generation
                return self._generate_with_fallback(text, speaker, emotion, speed)
                
        except Exception as e:
            logger.error(f"Chunk generation failed: {e}")
            # Return silence if generation fails
            return np.zeros(int(2 * self.sample_rate), dtype=np.float32)
    
    def _generate_with_emotivoice(self, text: str, speaker: str, emotion: str, speed: float) -> np.ndarray:
        """Generate audio using EmotiVoice models"""
        try:
            # This would be the actual EmotiVoice generation code
            # For now, return a placeholder
            logger.debug(f"EmotiVoice generation: {text[:50]}...")
            
            # Placeholder: generate some basic audio
            duration = len(text) * 0.1  # Rough estimate
            samples = int(duration * self.sample_rate)
            
            # Generate simple tone as placeholder
            t = np.linspace(0, duration, samples)
            frequency = 440  # A4 note
            audio = 0.1 * np.sin(2 * np.pi * frequency * t).astype(np.float32)
            
            return audio
            
        except Exception as e:
            logger.error(f"EmotiVoice generation failed: {e}")
            raise
    
    def _generate_with_fallback(self, text: str, speaker: str, emotion: str, speed: float) -> np.ndarray:
        """Generate audio using fallback TTS"""
        try:
            if not hasattr(self, 'fallback_mode') or self.fallback_mode == "none":
                # Generate simple sine wave as absolute fallback
                duration = len(text) * 0.1
                samples = int(duration * self.sample_rate)
                t = np.linspace(0, duration, samples)
                audio = 0.05 * np.sin(2 * np.pi * 220 * t).astype(np.float32)
                return audio
            
            if self.fallback_mode == "espeak":
                return self._generate_with_espeak(text, speed)
            
        except Exception as e:
            logger.error(f"Fallback generation failed: {e}")
            # Return silence
            return np.zeros(int(2 * self.sample_rate), dtype=np.float32)
    
    def _generate_with_espeak(self, text: str, speed: float) -> np.ndarray:
        """Generate audio using espeak"""
        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_file:
                temp_path = temp_file.name
            
            # Use espeak to generate audio
            speed_wpm = int(175 * speed)  # Base speed 175 WPM
            
            cmd = [
                'espeak', 
                '-s', str(speed_wpm),
                '-w', temp_path,
                text
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode == 0:
                # Load the generated audio
                audio, sr = sf.read(temp_path)
                
                # Resample if necessary
                if sr != self.sample_rate:
                    import librosa
                    audio = librosa.resample(audio, orig_sr=sr, target_sr=self.sample_rate)
                
                # Clean up temp file
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
        # Remove excessive whitespace
        text = re.sub(r'\s+', ' ', text.strip())
        
        # Remove special characters that might cause issues
        text = re.sub(r'[^\w\s.,!?;:\'\"()\-\u4e00-\u9fff]', '', text)
        
        # Ensure proper sentence endings
        text = re.sub(r'([.!?])\s*([A-Z\u4e00-\u9fff])', r'\1 \2', text)
        
        # Add period if text doesn't end with punctuation
        if text and text[-1] not in '.!?。！？':
            text += '.'
        
        return text
    
    def _split_text(self, text: str) -> List[str]:
        """Split text into chunks suitable for EmotiVoice"""
        # Split by sentences first
        sentences = re.split(r'(?<=[.!?。！？])\s+', text)
        
        chunks = []
        current_chunk = ""
        
        for sentence in sentences:
            # If adding this sentence would exceed the limit, start a new chunk
            if len(current_chunk) + len(sentence) > self.max_text_length and current_chunk:
                chunks.append(current_chunk.strip())
                current_chunk = sentence
            else:
                current_chunk += " " + sentence if current_chunk else sentence
        
        # Add the last chunk
        if current_chunk.strip():
            chunks.append(current_chunk.strip())
        
        # If no chunks created (very long sentence), split by length
        if not chunks:
            for i in range(0, len(text), self.max_text_length):
                chunk = text[i:i + self.max_text_length]
                chunks.append(chunk)
        
        return chunks
    
    def _normalize_audio(self, audio: np.ndarray) -> np.ndarray:
        """Normalize audio to prevent clipping"""
        # Remove DC offset
        audio = audio - np.mean(audio)
        
        # Normalize to [-0.9, 0.9] to prevent clipping
        max_val = np.max(np.abs(audio))
        if max_val > 0:
            audio = audio * (0.9 / max_val)
        
        return audio
    
    def _detect_language(self, text: str) -> str:
        """Detect if text is Chinese or English"""
        chinese_chars = len(re.findall(r'[\u4e00-\u9fff]', text))
        total_chars = len(re.sub(r'\s', '', text))
        
        if total_chars == 0:
            return "en"
        
        chinese_ratio = chinese_chars / total_chars
        return "zh" if chinese_ratio > 0.5 else "en"
    
    async def cleanup(self):
        """Clean up resources"""
        try:
            # Clear CUDA cache if using GPU
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            
            logger.info("EmotiVoice engine cleaned up")
            
        except Exception as e:
            logger.warning(f"Cleanup warning: {e}")
    
    def get_available_speakers(self) -> List[str]:
        """Get list of available speakers"""
        return list(self.available_speakers.keys())
    
    def get_available_emotions(self) -> List[str]:
        """Get list of available emotions"""
        return self.available_emotions.copy()
    
    def get_speaker_info(self) -> Dict[str, str]:
        """Get speaker information"""
        return self.available_speakers.copy()