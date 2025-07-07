import os
import logging
import asyncio
import re
from pathlib import Path
from typing import Optional, List
import warnings

import torch
import numpy as np
from bark import SAMPLE_RATE, generate_audio, preload_models
from bark.generation import SUPPORTED_LANGS
import scipy.io.wavfile as wavfile

# Suppress warnings
warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)

logger = logging.getLogger(__name__)

class TTSEngine:
    def __init__(self):
        self.is_loaded = False
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.sample_rate = SAMPLE_RATE
        self.max_chunk_length = 200  # Maximum words per chunk
        
        logger.info(f"TTS Engine initialized on device: {self.device}")
    
    async def load_model(self):
        """Load the Bark TTS model"""
        try:
            logger.info("Loading Bark TTS model...")
            
            # Preload models in a separate thread to avoid blocking
            await asyncio.get_event_loop().run_in_executor(
                None, self._load_models_sync
            )
            
            self.is_loaded = True
            logger.info("Bark TTS model loaded successfully")
            
        except Exception as e:
            logger.error(f"Failed to load TTS model: {e}")
            raise
    
    def _load_models_sync(self):
        """Synchronous model loading"""
        # Download and preload all models
        preload_models(
            text_use_gpu=torch.cuda.is_available(),
            text_use_small=False,
            coarse_use_gpu=torch.cuda.is_available(),
            coarse_use_small=False,
            fine_use_gpu=torch.cuda.is_available(),
            fine_use_small=False,
            codec_use_gpu=torch.cuda.is_available()
        )
    
    async def generate_speech(
        self, 
        text: str, 
        output_path: Path, 
        voice_preset: str = "v2/en_speaker_6"
    ):
        """Generate speech from text using Bark"""
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
                    None, self._generate_chunk, chunk, voice_preset
                )
                
                audio_arrays.append(audio_array)
                
                # Add short pause between chunks
                if i < len(chunks) - 1:
                    pause_samples = int(0.5 * self.sample_rate)  # 0.5 second pause
                    pause = np.zeros(pause_samples, dtype=np.float32)
                    audio_arrays.append(pause)
            
            # Concatenate all audio chunks
            if audio_arrays:
                final_audio = np.concatenate(audio_arrays)
                
                # Normalize audio
                final_audio = self._normalize_audio(final_audio)
                
                # Save as WAV file
                wavfile.write(
                    str(output_path), 
                    self.sample_rate, 
                    final_audio
                )
                
                logger.info(f"Audio saved to: {output_path}")
            else:
                raise RuntimeError("No audio generated")
                
        except Exception as e:
            logger.error(f"Speech generation failed: {e}")
            raise
    
    def _generate_chunk(self, text: str, voice_preset: str) -> np.ndarray:
        """Generate audio for a single text chunk"""
        try:
            # Generate audio with Bark
            audio_array = generate_audio(
                text, 
                history_prompt=voice_preset,
                text_temp=0.7,
                waveform_temp=0.7
            )
            
            return audio_array.astype(np.float32)
            
        except Exception as e:
            logger.error(f"Chunk generation failed: {e}")
            # Return silence if generation fails
            return np.zeros(int(2 * self.sample_rate), dtype=np.float32)
    
    def _clean_text(self, text: str) -> str:
        """Clean and prepare text for TTS"""
        # Remove excessive whitespace
        text = re.sub(r'\s+', ' ', text.strip())
        
        # Remove special characters that might cause issues
        text = re.sub(r'[^\w\s.,!?;:\'\"()\-]', '', text)
        
        # Ensure proper sentence endings
        text = re.sub(r'([.!?])\s*([A-Z])', r'\1 \2', text)
        
        # Add period if text doesn't end with punctuation
        if text and text[-1] not in '.!?':
            text += '.'
        
        return text
    
    def _split_text(self, text: str) -> List[str]:
        """Split text into chunks suitable for Bark"""
        # Split by sentences first
        sentences = re.split(r'(?<=[.!?])\s+', text)
        
        chunks = []
        current_chunk = ""
        current_word_count = 0
        
        for sentence in sentences:
            sentence_words = len(sentence.split())
            
            # If adding this sentence would exceed the limit, start a new chunk
            if current_word_count + sentence_words > self.max_chunk_length and current_chunk:
                chunks.append(current_chunk.strip())
                current_chunk = sentence
                current_word_count = sentence_words
            else:
                current_chunk += " " + sentence if current_chunk else sentence
                current_word_count += sentence_words
        
        # Add the last chunk
        if current_chunk.strip():
            chunks.append(current_chunk.strip())
        
        # If no chunks created (very long sentence), split by word count
        if not chunks:
            words = text.split()
            for i in range(0, len(words), self.max_chunk_length):
                chunk_words = words[i:i + self.max_chunk_length]
                chunks.append(" ".join(chunk_words))
        
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
    
    async def cleanup(self):
        """Clean up resources"""
        try:
            # Clear CUDA cache if using GPU
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            
            logger.info("TTS engine cleaned up")
            
        except Exception as e:
            logger.warning(f"Cleanup warning: {e}")
    
    def get_supported_voices(self) -> List[str]:
        """Get list of supported voice presets"""
        return [
            "v2/en_speaker_0", "v2/en_speaker_1", "v2/en_speaker_2", 
            "v2/en_speaker_3", "v2/en_speaker_4", "v2/en_speaker_5",
            "v2/en_speaker_6", "v2/en_speaker_7", "v2/en_speaker_8", 
            "v2/en_speaker_9"
        ]
    
    def get_supported_languages(self) -> List[str]:
        """Get list of supported languages"""
        return list(SUPPORTED_LANGS)