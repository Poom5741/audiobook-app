// Local storage utilities for managing book progress

export interface BookProgress {
  bookSlug: string;
  currentChapter: number;
  completedChapters: number[];
  lastPosition?: number;
  lastAccessed: string;
  totalChapters: number;
}

const PROGRESS_KEY = 'audiobook_progress';

export const progressStorage = {
  // Get progress for a specific book
  getProgress(bookSlug: string): BookProgress | null {
    if (typeof window === 'undefined') return null;
    
    try {
      const allProgress = this.getAllProgress();
      return allProgress.find(p => p.bookSlug === bookSlug) || null;
    } catch (error) {
      console.error('Error getting book progress:', error);
      return null;
    }
  },

  // Get all book progress
  getAllProgress(): BookProgress[] {
    if (typeof window === 'undefined') return [];
    
    try {
      const stored = localStorage.getItem(PROGRESS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error getting all progress:', error);
      return [];
    }
  },

  // Save or update progress for a book
  saveProgress(progress: BookProgress): void {
    if (typeof window === 'undefined') return;
    
    try {
      const allProgress = this.getAllProgress();
      const index = allProgress.findIndex(p => p.bookSlug === progress.bookSlug);
      
      if (index >= 0) {
        allProgress[index] = progress;
      } else {
        allProgress.push(progress);
      }
      
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(allProgress));
    } catch (error) {
      console.error('Error saving progress:', error);
    }
  },

  // Mark a chapter as completed
  markChapterCompleted(bookSlug: string, chapterNumber: number): void {
    const progress = this.getProgress(bookSlug);
    
    if (progress) {
      if (!progress.completedChapters.includes(chapterNumber)) {
        progress.completedChapters.push(chapterNumber);
        progress.completedChapters.sort((a, b) => a - b);
      }
      progress.lastAccessed = new Date().toISOString();
      this.saveProgress(progress);
    }
  },

  // Update current chapter
  updateCurrentChapter(bookSlug: string, chapterNumber: number): void {
    const progress = this.getProgress(bookSlug);
    
    if (progress) {
      progress.currentChapter = chapterNumber;
      progress.lastAccessed = new Date().toISOString();
      this.saveProgress(progress);
    } else {
      // Create new progress entry
      this.saveProgress({
        bookSlug,
        currentChapter: chapterNumber,
        completedChapters: [],
        lastAccessed: new Date().toISOString(),
        totalChapters: 1 // Will be updated when book loads
      });
    }
  },

  // Clear progress for a book
  clearProgress(bookSlug: string): void {
    if (typeof window === 'undefined') return;
    
    try {
      const allProgress = this.getAllProgress();
      const filtered = allProgress.filter(p => p.bookSlug !== bookSlug);
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.error('Error clearing progress:', error);
    }
  },

  // Clear all progress
  clearAllProgress(): void {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.removeItem(PROGRESS_KEY);
    } catch (error) {
      console.error('Error clearing all progress:', error);
    }
  }
};

// Playback storage utilities
export interface PlaybackPosition {
  bookSlug: string;
  chapter: number;
  position: number;
  timestamp: string;
}

const PLAYBACK_KEY = 'audiobook_playback';

export const playbackStorage = {
  // Save playback position
  savePosition(bookSlug: string, chapter: number, position: number): void {
    if (typeof window === 'undefined') return;
    
    try {
      const positions = this.getAllPositions();
      const index = positions.findIndex(p => p.bookSlug === bookSlug && p.chapter === chapter);
      
      const newPosition: PlaybackPosition = {
        bookSlug,
        chapter,
        position,
        timestamp: new Date().toISOString()
      };
      
      if (index >= 0) {
        positions[index] = newPosition;
      } else {
        positions.push(newPosition);
      }
      
      localStorage.setItem(PLAYBACK_KEY, JSON.stringify(positions));
    } catch (error) {
      console.error('Error saving playback position:', error);
    }
  },

  // Get playback position
  getPosition(bookSlug: string, chapter: number): number {
    if (typeof window === 'undefined') return 0;
    
    try {
      const positions = this.getAllPositions();
      const position = positions.find(p => p.bookSlug === bookSlug && p.chapter === chapter);
      return position?.position || 0;
    } catch (error) {
      console.error('Error getting playback position:', error);
      return 0;
    }
  },

  // Get all positions
  getAllPositions(): PlaybackPosition[] {
    if (typeof window === 'undefined') return [];
    
    try {
      const stored = localStorage.getItem(PLAYBACK_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error getting all playback positions:', error);
      return [];
    }
  },

  // Clear position for a book
  clearBookPositions(bookSlug: string): void {
    if (typeof window === 'undefined') return;
    
    try {
      const positions = this.getAllPositions();
      const filtered = positions.filter(p => p.bookSlug !== bookSlug);
      localStorage.setItem(PLAYBACK_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.error('Error clearing book positions:', error);
    }
  }
};

// Settings storage utilities
export interface AudioSettings {
  playbackSpeed: number;
  volume: number;
  autoPlay: boolean;
  continuousPlay: boolean;
}

const SETTINGS_KEY = 'audiobook_settings';

export const settingsStorage = {
  // Get settings
  getSettings(): AudioSettings {
    if (typeof window === 'undefined') {
      return {
        playbackSpeed: 1.0,
        volume: 1.0,
        autoPlay: true,
        continuousPlay: true
      };
    }
    
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      return stored ? JSON.parse(stored) : {
        playbackSpeed: 1.0,
        volume: 1.0,
        autoPlay: true,
        continuousPlay: true
      };
    } catch (error) {
      console.error('Error getting settings:', error);
      return {
        playbackSpeed: 1.0,
        volume: 1.0,
        autoPlay: true,
        continuousPlay: true
      };
    }
  },

  // Save settings
  saveSettings(settings: Partial<AudioSettings>): void {
    if (typeof window === 'undefined') return;
    
    try {
      const currentSettings = this.getSettings();
      const updated = { ...currentSettings, ...settings };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  },

  // Reset settings
  resetSettings(): void {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.removeItem(SETTINGS_KEY);
    } catch (error) {
      console.error('Error resetting settings:', error);
    }
  }
};