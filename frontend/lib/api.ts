import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

const api = axios.create({
  baseURL: `${API_BASE}/api`,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Types
export interface Book {
  id: string;
  title: string;
  author: string;
  slug: string;
  total_chapters: number;
  total_duration?: number;
  created_at: string;
  updated_at: string;
}

export interface Chapter {
  id: string;
  book_id: string;
  chapter_number: number;
  title: string;
  duration?: number;
  audio_available: boolean;
  text_length?: number;
}

export interface AudioInfo {
  exists: boolean;
  path: string;
  size: number;
  duration: number;
  created: number;
  modified: number;
}

// API functions
export const booksApi = {
  // Get all books
  async getBooks(): Promise<Book[]> {
    try {
      const response = await api.get('/books');
      return response.data.books || [];
    } catch (error) {
      console.error('Failed to fetch books:', error);
      return [];
    }
  },

  // Get book details
  async getBook(slug: string): Promise<Book | null> {
    try {
      const response = await api.get(`/books/${slug}`);
      return response.data.book || null;
    } catch (error) {
      console.error(`Failed to fetch book ${slug}:`, error);
      return null;
    }
  },

  // Get book chapters
  async getChapters(slug: string): Promise<Chapter[]> {
    try {
      const response = await api.get(`/books/${slug}/chapters`);
      return response.data.chapters || [];
    } catch (error) {
      console.error(`Failed to fetch chapters for ${slug}:`, error);
      return [];
    }
  },

  // Get audio info
  async getAudioInfo(slug: string, chapter: string): Promise<AudioInfo | null> {
    try {
      const response = await api.get(`/audio/${slug}/${chapter}/info`);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch audio info for ${slug}/${chapter}:`, error);
      return null;
    }
  },

  // Generate audio stream URL
  getAudioUrl(slug: string, chapter: string): string {
    return `${API_BASE}/api/audio/${slug}/${chapter}`;
  },

  // Trigger TTS generation
  async generateAudio(slug: string, chapter: string): Promise<boolean> {
    try {
      const response = await api.post(`/generate/${slug}/${chapter}`);
      return response.data.success || false;
    } catch (error) {
      console.error(`Failed to generate audio for ${slug}/${chapter}:`, error);
      return false;
    }
  },
};

export default api;