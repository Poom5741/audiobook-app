import logging
import asyncio
from pathlib import Path
from typing import Optional
import subprocess
import tempfile

import librosa
import soundfile as sf
from pydub import AudioSegment
from pydub.effects import normalize, compress_dynamic_range
import numpy as np

logger = logging.getLogger(__name__)

class AudioProcessor:
    def __init__(self):
        self.sample_rate = 24000  # Standard for most TTS outputs
        self.target_sample_rate = 22050  # Good balance for web streaming
    
    async def process_audio(
        self, 
        input_path: Path, 
        output_path: Path, 
        quality: str = "standard"
    ) -> Path:
        """Process and convert audio file"""
        try:
            logger.debug(f"Processing audio: {input_path} -> {output_path}")
            
            # Load audio file
            audio_data, sample_rate = librosa.load(str(input_path), sr=None)
            
            # Apply audio processing
            processed_audio = await self._apply_processing(audio_data, sample_rate, quality)
            
            # Convert to MP3
            mp3_path = await self._convert_to_mp3(processed_audio, output_path, quality)
            
            logger.debug(f"Audio processing completed: {mp3_path}")
            return mp3_path
            
        except Exception as e:
            logger.error(f"Audio processing failed: {e}")
            raise
    
    async def _apply_processing(
        self, 
        audio_data: np.ndarray, 
        sample_rate: int, 
        quality: str
    ) -> np.ndarray:
        """Apply audio processing effects"""
        try:
            # Resample if needed
            if sample_rate != self.target_sample_rate:
                audio_data = librosa.resample(
                    audio_data, 
                    orig_sr=sample_rate, 
                    target_sr=self.target_sample_rate
                )
            
            # Remove silence at beginning and end
            audio_data, _ = librosa.effects.trim(
                audio_data, 
                top_db=20,  # Remove parts quieter than -20dB
                frame_length=2048,
                hop_length=512
            )
            
            # Normalize audio levels
            audio_data = librosa.util.normalize(audio_data, norm=np.inf)
            
            # Apply gentle compression for consistent levels
            if quality == "high":
                # More processing for higher quality
                audio_data = self._apply_compression(audio_data)
                audio_data = self._apply_noise_reduction(audio_data)
            
            # Ensure we don't have any clipping
            audio_data = np.clip(audio_data, -0.95, 0.95)
            
            return audio_data
            
        except Exception as e:
            logger.error(f"Audio processing effects failed: {e}")
            return audio_data  # Return original if processing fails
    
    def _apply_compression(self, audio_data: np.ndarray) -> np.ndarray:
        """Apply dynamic range compression"""
        try:
            # Simple soft compression
            threshold = 0.7
            ratio = 3.0
            
            # Find peaks above threshold
            above_threshold = np.abs(audio_data) > threshold
            
            # Apply compression to peaks
            compressed = audio_data.copy()
            compressed[above_threshold] = (
                np.sign(audio_data[above_threshold]) * 
                (threshold + (np.abs(audio_data[above_threshold]) - threshold) / ratio)
            )
            
            return compressed
            
        except Exception as e:
            logger.warning(f"Compression failed: {e}")
            return audio_data
    
    def _apply_noise_reduction(self, audio_data: np.ndarray) -> np.ndarray:
        """Apply basic noise reduction"""
        try:
            # Simple spectral gating
            stft = librosa.stft(audio_data, n_fft=2048, hop_length=512)
            magnitude = np.abs(stft)
            
            # Estimate noise floor
            noise_floor = np.percentile(magnitude, 10)
            
            # Create mask
            mask = magnitude > (noise_floor * 1.5)
            
            # Apply mask
            filtered_stft = stft * mask
            
            # Convert back to time domain
            filtered_audio = librosa.istft(filtered_stft, hop_length=512)
            
            return filtered_audio
            
        except Exception as e:
            logger.warning(f"Noise reduction failed: {e}")
            return audio_data
    
    async def _convert_to_mp3(
        self, 
        audio_data: np.ndarray, 
        output_path: Path, 
        quality: str
    ) -> Path:
        """Convert audio to MP3 format"""
        try:
            # Ensure output has .mp3 extension
            if output_path.suffix.lower() != '.mp3':
                output_path = output_path.with_suffix('.mp3')
            
            # Create temporary WAV file
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp_wav:
                temp_wav_path = Path(temp_wav.name)
            
            try:
                # Save as temporary WAV
                sf.write(
                    str(temp_wav_path), 
                    audio_data, 
                    self.target_sample_rate,
                    format='WAV',
                    subtype='PCM_16'
                )
                
                # Load with pydub for MP3 conversion
                audio = AudioSegment.from_wav(str(temp_wav_path))
                
                # Apply pydub effects
                audio = normalize(audio)
                
                if quality == "high":
                    # Higher quality settings
                    bitrate = "192k"
                    audio = compress_dynamic_range(audio)
                else:
                    # Standard quality
                    bitrate = "128k"
                
                # Export as MP3
                audio.export(
                    str(output_path),
                    format="mp3",
                    bitrate=bitrate,
                    parameters=[
                        "-ac", "1",  # Mono
                        "-ar", str(self.target_sample_rate),
                        "-acodec", "libmp3lame",
                        "-q:a", "2" if quality == "high" else "4"
                    ]
                )
                
                return output_path
                
            finally:
                # Clean up temporary file
                if temp_wav_path.exists():
                    temp_wav_path.unlink()
                    
        except Exception as e:
            logger.error(f"MP3 conversion failed: {e}")
            raise
    
    async def get_duration(self, audio_path: Path) -> float:
        """Get audio file duration in seconds"""
        try:
            audio = AudioSegment.from_file(str(audio_path))
            return len(audio) / 1000.0  # Convert milliseconds to seconds
            
        except Exception as e:
            logger.error(f"Failed to get audio duration: {e}")
            return 0.0
    
    async def get_audio_info(self, audio_path: Path) -> dict:
        """Get detailed audio file information"""
        try:
            audio = AudioSegment.from_file(str(audio_path))
            
            return {
                "duration": len(audio) / 1000.0,
                "sample_rate": audio.frame_rate,
                "channels": audio.channels,
                "frame_width": audio.frame_width,
                "bitrate": getattr(audio, 'bitrate', None),
                "format": audio_path.suffix.lower()
            }
            
        except Exception as e:
            logger.error(f"Failed to get audio info: {e}")
            return {}
    
    def validate_audio_file(self, audio_path: Path) -> bool:
        """Validate that audio file is playable"""
        try:
            audio = AudioSegment.from_file(str(audio_path))
            return len(audio) > 0
            
        except Exception as e:
            logger.error(f"Audio validation failed: {e}")
            return False