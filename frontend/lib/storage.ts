// Types for localStorage data
export interface PlaybackPosition {
  bookSlug: string;
  chapter: string;
  currentTime: number;
  duration: number;
  lastPlayed: number; // timestamp
}

export interface BookProgress {
  bookSlug: string;
  currentChapter: string;
  totalChapters: number;
  completedChapters: string[];
  lastAccessed: number;
}

const STORAGE_KEYS = {
  PLAYBACK_POSITION: 'audiobook_playback_position',
  BOOK_PROGRESS: 'audiobook_book_progress',
  VOLUME: 'audiobook_volume',
  PLAYBACK_RATE: 'audiobook_playback_rate',
} as const;

// Playback position management
export const playbackStorage = {
  // Save current playback position
  savePosition(bookSlug: string, chapter: string, currentTime: number, duration: number): void {
    try {
      const position: PlaybackPosition = {
        bookSlug,
        chapter,
        currentTime,
        duration,
        lastPlayed: Date.now(),
      };
      
      localStorage.setItem(
        `${STORAGE_KEYS.PLAYBACK_POSITION}_${bookSlug}_${chapter}`,
        JSON.stringify(position)
      );
    } catch (error) {
      console.warn('Failed to save playback position:', error);
    }
  },

  // Get saved playback position
  getPosition(bookSlug: string, chapter: string): PlaybackPosition | null {
    try {
      const data = localStorage.getItem(`${STORAGE_KEYS.PLAYBACK_POSITION}_${bookSlug}_${chapter}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.warn('Failed to get playback position:', error);
      return null;
    }
  },

  // Clear position for specific chapter
  clearPosition(bookSlug: string, chapter: string): void {
    try {
      localStorage.removeItem(`${STORAGE_KEYS.PLAYBACK_POSITION}_${bookSlug}_${chapter}`);
    } catch (error) {
      console.warn('Failed to clear playback position:', error);
    }
  },

  // Get all positions for a book
  getBookPositions(bookSlug: string): PlaybackPosition[] {
    try {
      const positions: PlaybackPosition[] = [];
      const keyPrefix = `${STORAGE_KEYS.PLAYBACK_POSITION}_${bookSlug}_`;
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(keyPrefix)) {
          const data = localStorage.getItem(key);
          if (data) {
            positions.push(JSON.parse(data));
          }
        }
      }
      
      return positions.sort((a, b) => b.lastPlayed - a.lastPlayed);
    } catch (error) {
      console.warn('Failed to get book positions:', error);
      return [];
    }
  },
};

// Book progress management
export const progressStorage = {
  // Save book progress
  saveProgress(progress: BookProgress): void {
    try {
      localStorage.setItem(
        `${STORAGE_KEYS.BOOK_PROGRESS}_${progress.bookSlug}`,
        JSON.stringify(progress)
      );
    } catch (error) {
      console.warn('Failed to save book progress:', error);
    }
  },

  // Get book progress
  getProgress(bookSlug: string): BookProgress | null {
    try {
      const data = localStorage.getItem(`${STORAGE_KEYS.BOOK_PROGRESS}_${bookSlug}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.warn('Failed to get book progress:', error);
      return null;
    }
  },

  // Mark chapter as completed
  markChapterCompleted(bookSlug: string, chapter: string, totalChapters: number): void {
    try {
      const existing = this.getProgress(bookSlug) || {
        bookSlug,
        currentChapter: chapter,
        totalChapters,
        completedChapters: [],
        lastAccessed: Date.now(),
      };

      if (!existing.completedChapters.includes(chapter)) {
        existing.completedChapters.push(chapter);
      }
      
      existing.lastAccessed = Date.now();
      this.saveProgress(existing);
    } catch (error) {
      console.warn('Failed to mark chapter completed:', error);
    }
  },

  // Update current chapter
  updateCurrentChapter(bookSlug: string, chapter: string, totalChapters: number): void {
    try {
      const existing = this.getProgress(bookSlug) || {
        bookSlug,
        currentChapter: chapter,
        totalChapters,
        completedChapters: [],
        lastAccessed: Date.now(),
      };

      existing.currentChapter = chapter;
      existing.lastAccessed = Date.now();
      this.saveProgress(existing);
    } catch (error) {
      console.warn('Failed to update current chapter:', error);
    }
  },

  // Get all book progress (for recent books)
  getAllProgress(): BookProgress[] {
    try {
      const progress: BookProgress[] = [];
      const keyPrefix = `${STORAGE_KEYS.BOOK_PROGRESS}_`;
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(keyPrefix)) {
          const data = localStorage.getItem(key);
          if (data) {
            progress.push(JSON.parse(data));
          }
        }
      }
      
      return progress.sort((a, b) => b.lastAccessed - a.lastAccessed);
    } catch (error) {
      console.warn('Failed to get all progress:', error);
      return [];
    }
  },
};

// Audio settings
export const settingsStorage = {
  // Volume (0.0 - 1.0)
  saveVolume(volume: number): void {
    try {
      localStorage.setItem(STORAGE_KEYS.VOLUME, volume.toString());
    } catch (error) {
      console.warn('Failed to save volume:', error);
    }
  },

  getVolume(): number {
    try {
      const volume = localStorage.getItem(STORAGE_KEYS.VOLUME);
      return volume ? parseFloat(volume) : 1.0;
    } catch (error) {
      console.warn('Failed to get volume:', error);
      return 1.0;
    }
  },

  // Playback rate (0.5 - 2.0)
  savePlaybackRate(rate: number): void {
    try {
      localStorage.setItem(STORAGE_KEYS.PLAYBACK_RATE, rate.toString());
    } catch (error) {
      console.warn('Failed to save playback rate:', error);
    }
  },

  getPlaybackRate(): number {
    try {
      const rate = localStorage.getItem(STORAGE_KEYS.PLAYBACK_RATE);
      return rate ? parseFloat(rate) : 1.0;
    } catch (error) {
      console.warn('Failed to get playback rate:', error);
      return 1.0;
    }
  },
};

// Utility functions
export const storageUtils = {
  // Clear all audiobook data
  clearAll(): void {
    try {
      const keys = Object.values(STORAGE_KEYS);
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && keys.some(storageKey => key.startsWith(storageKey))) {
          localStorage.removeItem(key);
        }
      }
    } catch (error) {
      console.warn('Failed to clear storage:', error);
    }
  },

  // Get storage size usage
  getStorageSize(): number {
    try {
      let total = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const value = localStorage.getItem(key);
          if (value) {
            total += key.length + value.length;
          }
        }
      }
      return total;
    } catch (error) {
      console.warn('Failed to calculate storage size:', error);
      return 0;
    }
  },
};

export default {
  playbackStorage,
  progressStorage,
  settingsStorage,
  storageUtils,
};