'use client';

import { useState, useEffect, useRef } from 'react';
import { booksApi } from '@/lib/api';
import { playbackStorage, settingsStorage, progressStorage } from '@/lib/storage';

interface AudioPlayerProps {
  bookSlug: string;
  chapter: string;
  chapterTitle: string;
  totalChapters: number;
  onChapterComplete?: (chapter: string) => void;
  onNextChapter?: () => void;
  onPrevChapter?: () => void;
}

export default function AudioPlayer({
  bookSlug,
  chapter,
  chapterTitle,
  totalChapters,
  onChapterComplete,
  onNextChapter,
  onPrevChapter,
}: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadAudioSettings();
    loadAudioFile();
    
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [bookSlug, chapter]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      audioRef.current.playbackRate = playbackRate;
    }
  }, [volume, playbackRate]);

  useEffect(() => {
    // Save progress periodically when playing
    if (isPlaying && currentTime > 0) {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      
      progressIntervalRef.current = setInterval(() => {
        savePlaybackPosition();
      }, 5000); // Save every 5 seconds
      
      return () => {
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
        }
      };
    }
  }, [isPlaying, currentTime, duration]);

  const loadAudioSettings = () => {
    const settings = settingsStorage.getSettings();
    setVolume(settings.volume);
    setPlaybackRate(settings.playbackSpeed);
  };

  const loadAudioFile = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Check if audio exists
      const audioInfo = await booksApi.getAudioInfo(bookSlug, chapter);
      if (!audioInfo || !audioInfo.exists) {
        throw new Error('Audio file not available');
      }
      
      // Load saved position
      const savedPosition = playbackStorage.getPosition(bookSlug, parseInt(chapter));
      
      const audio = audioRef.current;
      if (audio) {
        audio.src = booksApi.getAudioUrl(bookSlug, chapter);
        
        audio.onloadedmetadata = () => {
          setDuration(audio.duration);
          
          // Restore saved position
          if (savedPosition > 0) {
            audio.currentTime = savedPosition;
            setCurrentTime(savedPosition);
          }
          
          setLoading(false);
        };
        
        audio.onerror = () => {
          setError('Failed to load audio file');
          setLoading(false);
        };
        
        audio.onended = () => {
          handleChapterComplete();
        };
        
        audio.ontimeupdate = () => {
          setCurrentTime(audio.currentTime);
        };
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audio');
      setLoading(false);
    }
  };

  const savePlaybackPosition = () => {
    if (currentTime > 0 && duration > 0) {
      playbackStorage.savePosition(bookSlug, parseInt(chapter), currentTime);
    }
  };

  const handleChapterComplete = () => {
    // Mark chapter as completed
    progressStorage.markChapterCompleted(bookSlug, parseInt(chapter));
    
    // Clear saved position for this book
    playbackStorage.clearBookPositions(bookSlug);
    
    // Notify parent component
    if (onChapterComplete) {
      onChapterComplete(chapter);
    }
    
    setIsPlaying(false);
  };

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      savePlaybackPosition();
    } else {
      audio.play();
      setIsPlaying(true);
      
      // Update current chapter in progress
      progressStorage.updateCurrentChapter(bookSlug, parseInt(chapter));
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newTime = parseFloat(e.target.value);
    audio.currentTime = newTime;
    setCurrentTime(newTime);
    savePlaybackPosition();
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    settingsStorage.saveSettings({ volume: newVolume });
  };

  const handlePlaybackRateChange = (rate: number) => {
    setPlaybackRate(rate);
    settingsStorage.saveSettings({ playbackSpeed: rate });
  };

  const skip = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newTime = Math.max(0, Math.min(duration, currentTime + seconds));
    audio.currentTime = newTime;
    setCurrentTime(newTime);
    savePlaybackPosition();
  };

  const formatTime = (time: number) => {
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (loading) {
    return (
      <div className="audio-player">
        <div className="loading">Loading audio...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="audio-player">
        <div className="error">{error}</div>
      </div>
    );
  }

  return (
    <div className="audio-player">
      <audio ref={audioRef} preload="metadata" />
      
      <div className="player-info">
        <div className="now-playing">
          🎧 {chapterTitle}
        </div>
        <div className="player-stats">
          Chapter {chapter} of {totalChapters}
        </div>
      </div>

      <div className="player-controls">
        {/* Skip backward */}
        <button
          className="btn btn-secondary btn-small"
          onClick={() => skip(-30)}
          title="Skip back 30s"
        >
          ⏪ 30s
        </button>

        {/* Previous chapter */}
        <button
          className="btn btn-secondary btn-small"
          onClick={onPrevChapter}
          disabled={!onPrevChapter}
          title="Previous chapter"
        >
          ⏮️
        </button>

        {/* Play/Pause */}
        <button
          className="btn btn-primary"
          onClick={togglePlayPause}
          style={{ minWidth: '80px' }}
        >
          {isPlaying ? '⏸️ Pause' : '▶️ Play'}
        </button>

        {/* Next chapter */}
        <button
          className="btn btn-secondary btn-small"
          onClick={onNextChapter}
          disabled={!onNextChapter}
          title="Next chapter"
        >
          ⏭️
        </button>

        {/* Skip forward */}
        <button
          className="btn btn-secondary btn-small"
          onClick={() => skip(30)}
          title="Skip forward 30s"
        >
          30s ⏩
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ margin: '1rem 0' }}>
        <input
          type="range"
          min="0"
          max={duration}
          value={currentTime}
          onChange={handleSeek}
          style={{ width: '100%' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#7f8c8d' }}>
          <span>{formatTime(currentTime)}</span>
          <span>{Math.round(progressPercentage)}%</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Volume and speed controls */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', fontSize: '0.9rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>🔊</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={volume}
            onChange={handleVolumeChange}
            style={{ width: '80px' }}
          />
          <span>{Math.round(volume * 100)}%</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>⚡</span>
          {[0.5, 0.75, 1, 1.25, 1.5, 2].map(rate => (
            <button
              key={rate}
              className={`btn btn-small ${playbackRate === rate ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => handlePlaybackRateChange(rate)}
            >
              {rate}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}