import axios from 'axios';
import { addAuthToApi } from './auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

const api = axios.create({
  baseURL: `${API_BASE}/api`,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add authentication to API calls
addAuthToApi(api);

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

export interface SearchResult {
  id: string;
  title: string;
  author: string;
  year?: string;
  format: string;
  size?: string;
  url: string;
}

export interface DownloadJob {
  id: string;
  status: 'pending' | 'downloading' | 'completed' | 'failed';
  title: string;
  author: string;
  format: string;
  progress: number;
  url?: string;
  error?: string;
  created_at: string;
}

export interface PipelineJob {
  id: string;
  status: 'pending' | 'searching' | 'downloading' | 'parsing' | 'summarizing' | 'generating' | 'completed' | 'failed';
  searchQuery: string;
  currentStep: string;
  progress: number;
  bookTitle?: string;
  bookAuthor?: string;
  totalSteps: number;
  completedSteps: number;
  error?: string;
  created_at: string;
  steps?: {
    name: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    progress: number;
    message?: string;
  }[];
}

export interface AutoDownloadConfig {
  enabled: boolean;
  interval: number;
  searchQueries: string[];
  maxBooks: number;
  formats: string[];
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

// Search API
export const searchApi = {
  async searchBooks(query: string, formats: string[] = ['epub', 'pdf']): Promise<SearchResult[]> {
    try {
      const response = await axios.get('http://localhost:3002/api/search', {
        params: { q: query, formats: formats.join(',') }
      });
      return response.data.results || [];
    } catch (error) {
      console.error('Failed to search books:', error);
      return [];
    }
  },
};

// Download API  
export const downloadApi = {
  async downloadBook(url: string, title: string, author: string, format: string): Promise<string | null> {
    try {
      const response = await axios.post('http://localhost:3002/api/download', {
        url, title, author, format
      });
      return response.data.jobId || null;
    } catch (error) {
      console.error('Failed to start download:', error);
      return null;
    }
  },

  async getDownloadJobs(): Promise<DownloadJob[]> {
    try {
      const response = await axios.get('http://localhost:3002/api/downloads');
      return response.data.jobs || [];
    } catch (error) {
      console.error('Failed to get download jobs:', error);
      return [];
    }
  },

  async getDownloadJob(jobId: string): Promise<DownloadJob | null> {
    try {
      const response = await axios.get(`http://localhost:3002/api/downloads/${jobId}`);
      return response.data.job || null;
    } catch (error) {
      console.error(`Failed to get download job ${jobId}:`, error);
      return null;
    }
  },
};

// Pipeline API
export const pipelineApi = {
  async createAudiobook(
    searchQuery: string, 
    format: string[] = ['epub', 'pdf'], 
    maxBooks: number = 1,
    options: {
      summarize?: boolean;
      summaryStyle?: 'concise' | 'detailed' | 'bullets' | 'key-points';
    } = {}
  ): Promise<string | null> {
    try {
      const response = await axios.post('http://localhost:3001/api/pipeline/create-audiobook', {
        searchQuery, 
        format, 
        maxBooks,
        ...options
      });
      return response.data.jobId || null;
    } catch (error) {
      console.error('Failed to create audiobook:', error);
      return null;
    }
  },

  async createFromDirectLink(options: {
    url: string;
    title?: string;
    author?: string;
    formats: string[];
    summarize?: boolean;
    summaryStyle?: 'concise' | 'detailed' | 'bullets' | 'key-points';
  }): Promise<string | null> {
    try {
      const response = await axios.post('http://localhost:3001/api/pipeline/create-from-link', options);
      return response.data.jobId || null;
    } catch (error) {
      console.error('Failed to create audiobook from direct link:', error);
      return null;
    }
  },

  async getPipelineJobs(): Promise<PipelineJob[]> {
    try {
      const response = await axios.get('http://localhost:3001/api/pipeline/jobs');
      return response.data.jobs || [];
    } catch (error) {
      console.error('Failed to get pipeline jobs:', error);
      return [];
    }
  },

  async getPipelineJob(jobId: string): Promise<PipelineJob | null> {
    try {
      const response = await axios.get(`http://localhost:3001/api/pipeline/jobs/${jobId}`);
      return response.data.job || null;
    } catch (error) {
      console.error(`Failed to get pipeline job ${jobId}:`, error);
      return null;
    }
  },
};

// Auto-download API
export const autoDownloadApi = {
  async getConfig(): Promise<AutoDownloadConfig | null> {
    try {
      const response = await axios.get('http://localhost:3001/api/auto-download/config');
      return response.data.config || null;
    } catch (error) {
      console.error('Failed to get auto-download config:', error);
      return null;
    }
  },

  async updateConfig(config: Partial<AutoDownloadConfig>): Promise<boolean> {
    try {
      await axios.put('http://localhost:3001/api/auto-download/config', config);
      return true;
    } catch (error) {
      console.error('Failed to update auto-download config:', error);
      return false;
    }
  },

  async getStatus(): Promise<{ enabled: boolean; nextRun?: string; lastRun?: string } | null> {
    try {
      const response = await axios.get('http://localhost:3001/api/auto-download/status');
      return response.data || null;
    } catch (error) {
      console.error('Failed to get auto-download status:', error);
      return null;
    }
  },
};

export default api;