'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { booksApi, Book } from '@/lib/api';
import { progressStorage, BookProgress } from '@/lib/storage';

export default function HomePage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [progress, setProgress] = useState<Record<string, BookProgress>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBooks();
    loadProgress();
  }, []);

  const loadBooks = async () => {
    try {
      setLoading(true);
      const booksData = await booksApi.getBooks();
      setBooks(booksData);
    } catch (err) {
      setError('Failed to load books');
      console.error('Error loading books:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadProgress = () => {
    try {
      const allProgress = progressStorage.getAllProgress();
      const progressMap: Record<string, BookProgress> = {};
      allProgress.forEach(p => {
        progressMap[p.bookSlug] = p;
      });
      setProgress(progressMap);
    } catch (err) {
      console.error('Error loading progress:', err);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getProgressPercentage = (bookSlug: string, totalChapters: number) => {
    const bookProgress = progress[bookSlug];
    if (!bookProgress) return 0;
    return Math.round((bookProgress.completedChapters.length / totalChapters) * 100);
  };

  if (loading) {
    return <div className="loading">Loading books...</div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  return (
    <div>
      <h1 className="page-title">📚 Your Audiobook Library</h1>
      
      {books.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#7f8c8d' }}>
          <h2>No books found</h2>
          <p>Upload some books to get started!</p>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '1rem', color: '#7f8c8d' }}>
            Found {books.length} book{books.length !== 1 ? 's' : ''}
          </div>
          
          <div className="book-grid">
            {books.map((book) => {
              const bookProgress = progress[book.slug];
              const progressPercent = getProgressPercentage(book.slug, book.total_chapters);
              
              return (
                <Link 
                  key={book.id} 
                  href={`/book/${book.slug}`}
                  className="book-card"
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <h2 className="book-title">{book.title}</h2>
                  <p className="book-author">by {book.author}</p>
                  
                  <div className="book-meta">
                    <span>{book.total_chapters} chapter{book.total_chapters !== 1 ? 's' : ''}</span>
                    <span>Added {formatDate(book.created_at)}</span>
                  </div>
                  
                  {book.total_duration && (
                    <div className="book-meta">
                      <span>Duration: {Math.round(book.total_duration / 60)} minutes</span>
                    </div>
                  )}
                  
                  {bookProgress && (
                    <div className="progress-info">
                      {progressPercent === 100 ? (
                        <span>✅ Completed</span>
                      ) : progressPercent > 0 ? (
                        <span>📖 Progress: {progressPercent}% ({bookProgress.completedChapters.length}/{book.total_chapters} chapters)</span>
                      ) : (
                        <span>🎧 Continue from Chapter {bookProgress.currentChapter}</span>
                      )}
                      <br />
                      <small>Last accessed: {new Date(bookProgress.lastAccessed).toLocaleDateString()}</small>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}