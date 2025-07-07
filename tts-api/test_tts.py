#!/usr/bin/env python3

import asyncio
import aiohttp
import json
import time
import sys
from pathlib import Path

API_BASE = "http://localhost:8000"

async def test_emotivoice_api():
    """Test the EmotiVoice TTS API functionality"""
    print("🎙️ Testing EmotiVoice TTS API...\n")
    
    async with aiohttp.ClientSession() as session:
        try:
            # 1. Health check
            print("1️⃣ Health check...")
            async with session.get(f"{API_BASE}/health") as response:
                if response.status == 200:
                    health_data = await response.json()
                    print("✅ EmotiVoice TTS API is healthy")
                    print(f"   Model loaded: {health_data.get('model_loaded', False)}")
                    print(f"   GPU available: {health_data.get('gpu_available', False)}")
                    print(f"   Audio path: {health_data.get('audio_path', 'Unknown')}")
                    print(f"   Available speakers: {len(health_data.get('available_speakers', []))}")
                    print(f"   Available emotions: {health_data.get('available_emotions', [])}")
                else:
                    print(f"❌ Health check failed: {response.status}")
                    return
            
            # 2. Get available speakers and emotions
            print("\n2️⃣ Getting available speakers and emotions...")
            async with session.get(f"{API_BASE}/speakers") as response:
                if response.status == 200:
                    speakers_data = await response.json()
                    print("✅ Available options:")
                    print(f"   Speakers: {speakers_data.get('speakers', [])}")
                    print(f"   Emotions: {speakers_data.get('emotions', [])}")
                    print(f"   Default speaker: {speakers_data.get('default_speaker', 'Unknown')}")
                    print(f"   Default emotion: {speakers_data.get('default_emotion', 'Unknown')}")
                else:
                    print(f"❌ Failed to get speakers: {response.status}")
            
            # 3. Test TTS generation with simple request
            print("\n3️⃣ Testing TTS generation (simple)...")
            
            simple_payload = {
                "text": "Hello, this is a test of the EmotiVoice text-to-speech system. How does it sound?",
                "book": "test-book",
                "chapter": "1",
                "speaker": "9017",
                "emotion": "happy",
                "speed": 1.0
            }
            
            start_time = time.time()
            
            async with session.post(
                f"{API_BASE}/tts", 
                json=simple_payload,
                headers={"Content-Type": "application/json"}
            ) as response:
                
                response_data = await response.json()
                processing_time = time.time() - start_time
                
                if response.status == 200 and response_data.get('success'):
                    print("✅ Simple TTS generation successful")
                    print(f"   Audio path: {response_data.get('audio_path')}")
                    print(f"   Duration: {response_data.get('duration', 0):.2f}s")
                    print(f"   File size: {response_data.get('file_size', 0)} bytes")
                    print(f"   Processing time: {response_data.get('processing_time', processing_time):.2f}s")
                else:
                    print(f"❌ Simple TTS generation failed: {response_data.get('message', 'Unknown error')}")
                    return
            
            # 4. Test TTS generation with different speaker and emotion
            print("\n4️⃣ Testing TTS generation (different voice)...")
            
            voice_payload = {
                "text": "This is the same text, but with a different speaker and emotion. Can you hear the difference?",
                "book": "test-book",
                "chapter": "2",
                "speaker": "8051",  # Male voice
                "emotion": "neutral",
                "speed": 0.9
            }
            
            async with session.post(f"{API_BASE}/tts", json=voice_payload) as response:
                response_data = await response.json()
                
                if response.status == 200 and response_data.get('success'):
                    print("✅ Different voice TTS generation successful")
                    print(f"   Audio path: {response_data.get('audio_path')}")
                    print(f"   Duration: {response_data.get('duration', 0):.2f}s")
                    print(f"   Processing time: {response_data.get('processing_time', 0):.2f}s")
                else:
                    print(f"❌ Different voice TTS generation failed: {response_data.get('message', 'Unknown error')}")
            
            # 5. Test audio info endpoint
            print("\n5️⃣ Testing audio info endpoint...")
            async with session.get(f"{API_BASE}/audio/test-book/1/info") as response:
                if response.status == 200:
                    info_data = await response.json()
                    print("✅ Audio info retrieved successfully")
                    print(f"   File exists: {info_data.get('exists', False)}")
                    print(f"   File path: {info_data.get('path', 'Unknown')}")
                    print(f"   File size: {info_data.get('size', 0)} bytes")
                    print(f"   Duration: {info_data.get('duration', 0):.2f}s")
                else:
                    print(f"❌ Failed to get audio info: {response.status}")
            
            # 6. Test with Chinese text (if supported)
            print("\n6️⃣ Testing Chinese text support...")
            
            chinese_payload = {
                "text": "你好，这是中文语音合成测试。EmotiVoice支持中英文双语。",
                "book": "test-book-chinese",
                "chapter": "1",
                "speaker": "9017",
                "emotion": "happy",
                "speed": 1.0
            }
            
            async with session.post(f"{API_BASE}/tts", json=chinese_payload) as response:
                response_data = await response.json()
                
                if response.status == 200 and response_data.get('success'):
                    print("✅ Chinese TTS generation successful")
                    print(f"   Audio path: {response_data.get('audio_path')}")
                    print(f"   Processing time: {response_data.get('processing_time', 0):.2f}s")
                else:
                    print(f"⚠️ Chinese TTS generation result: {response_data.get('message', 'Unknown')}")
            
            # 7. Test different emotions
            print("\n7️⃣ Testing different emotions...")
            
            emotions_to_test = ["happy", "sad", "angry", "neutral"]
            
            for emotion in emotions_to_test:
                emotion_payload = {
                    "text": f"This text is spoken with {emotion} emotion. EmotiVoice can express different feelings.",
                    "book": "emotion-test",
                    "chapter": emotion,
                    "speaker": "9017",
                    "emotion": emotion,
                    "speed": 1.0
                }
                
                async with session.post(f"{API_BASE}/tts", json=emotion_payload) as response:
                    response_data = await response.json()
                    
                    if response.status == 200 and response_data.get('success'):
                        print(f"   ✅ Emotion '{emotion}': Success ({response_data.get('processing_time', 0):.1f}s)")
                    else:
                        print(f"   ❌ Emotion '{emotion}': Failed")
            
            print("\n✅ EmotiVoice TTS API testing completed successfully!")
            
        except aiohttp.ClientError as e:
            print(f"❌ Connection error: {e}")
        except Exception as e:
            print(f"❌ Test failed: {e}")

async def test_stress():
    """Stress test with long text"""
    print("\n🔥 Stress Testing with Long Text...\n")
    
    long_text = """
    EmotiVoice is an advanced text-to-speech system that combines emotional expressiveness with high-quality speech synthesis.
    It supports both English and Chinese languages, making it ideal for multilingual applications.
    
    The system uses deep learning models to generate natural-sounding speech with various emotional tones.
    Users can select from different speakers and emotions to create personalized audio experiences.
    
    This audiobook system leverages EmotiVoice to convert written content into engaging audio narratives.
    The microservice architecture ensures scalability and maintainability across different deployment environments.
    
    Key features include speaker selection, emotion control, speed adjustment, and high-quality audio output.
    The API is designed for easy integration with web applications and automated content generation pipelines.
    
    EmotiVoice represents the cutting edge of neural text-to-speech technology, providing both technical excellence
    and emotional authenticity in synthetic speech generation.
    """
    
    async with aiohttp.ClientSession() as session:
        stress_payload = {
            "text": long_text.strip(),
            "book": "stress-test",
            "chapter": "long-content",
            "speaker": "9017",
            "emotion": "neutral",
            "speed": 1.0
        }
        
        print(f"📝 Text length: {len(long_text)} characters")
        print("⏱️ Starting generation...")
        
        start_time = time.time()
        
        try:
            async with session.post(
                f"{API_BASE}/tts",
                json=stress_payload,
                timeout=aiohttp.ClientTimeout(total=600)  # 10 minute timeout
            ) as response:
                
                response_data = await response.json()
                total_time = time.time() - start_time
                
                if response.status == 200 and response_data.get('success'):
                    print("✅ Stress test successful!")
                    print(f"   Processing time: {response_data.get('processing_time', total_time):.2f}s")
                    print(f"   Audio duration: {response_data.get('duration', 0):.2f}s")
                    print(f"   File size: {response_data.get('file_size', 0):,} bytes")
                    if response_data.get('duration', 0) > 0:
                        print(f"   Speed ratio: {response_data.get('duration', 0) / total_time:.2f}x real-time")
                else:
                    print(f"❌ Stress test failed: {response_data.get('message', 'Unknown error')}")
                    
        except asyncio.TimeoutError:
            print("❌ Stress test timed out (>10 minutes)")
        except Exception as e:
            print(f"❌ Stress test error: {e}")

def print_usage():
    """Print usage instructions"""
    print("🎙️ EmotiVoice TTS API Test Suite\n")
    print("Usage:")
    print("  python test_tts.py [command]\n")
    print("Commands:")
    print("  test    - Run basic API tests (default)")
    print("  stress  - Run stress test with long text")
    print("  all     - Run all tests")
    print("\nMake sure the EmotiVoice TTS API is running on localhost:8000")

async def main():
    """Main test function"""
    command = sys.argv[1] if len(sys.argv) > 1 else "test"
    
    if command == "help":
        print_usage()
        return
    
    # Check if TTS API is running
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{API_BASE}/health", timeout=aiohttp.ClientTimeout(total=5)) as response:
                if response.status != 200:
                    print("❌ EmotiVoice TTS API is not responding properly")
                    return
    except:
        print("❌ EmotiVoice TTS API is not running!")
        print("\nStart the TTS API with:")
        print("cd tts-api && python app.py")
        print("or")
        print("docker-compose up tts-api")
        return
    
    if command in ["test", "all"]:
        await test_emotivoice_api()
    
    if command in ["stress", "all"]:
        await test_stress()

if __name__ == "__main__":
    asyncio.run(main())