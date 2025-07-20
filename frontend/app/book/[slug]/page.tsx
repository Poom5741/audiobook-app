'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { booksApi, Book, Chapter } from '@/lib/api';
import { progressStorage, playbackStorage } from '@/lib/storage';
import AudioPlayer from '@/components/AudioPlayer';
import EditBookModal from '@/components/EditBookModal'; // Assuming this component will be created

export default function BookPage() {
  const params = useParams();
  const bookId = params.slug as string;
  
  const router = useRouter();
  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentChapter, setCurrentChapter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatingAudio, setGeneratingAudio] = useState<Set<string>>(new Set());
  const [showEditModal, setShowEditModal] = useState(false);

  useEffect(() => {
    if (bookId) {
      loadBookData();
    }
  }, [bookId]);

  const loadBookData = async () => {
    try {
      setLoading(true);
      
      // Load book and chapters
      const [bookData, chaptersData] = await Promise.all([
        booksApi.getBook(bookId),
        booksApi.getChapters(bookId),
      ]);
      
      
      if (!bookData) {
        throw new Error('Book not found');
      }
      
      setBook(bookData);
      setChapters(chaptersData);
      
      // Load progress and set current chapter
      const progress = progressStorage.getProgress(bookId);
      if (progress && progress.currentChapter) {
        setCurrentChapter(progress.currentChapter.toString());
      } else if (chaptersData.length > 0) {
        // Start with first chapter if no progress
        setCurrentChapter(chaptersData[0].chapter_number.toString());
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load book');
      console.error('Error loading book:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleChapterSelect = (chapterNumber: string) => {
    setCurrentChapter(chapterNumber);
  };

  const handleGenerateAudio = async (chapterNumber: string) => {
    try {
      setGeneratingAudio(prev => new Set([...prev, chapterNumber]));
      
      const success = await booksApi.generateAudio(bookId, chapterNumber);
      if (success) {
        // Refresh chapters to update audio status
        const updatedChapters = await booksApi.getChapters(bookId);
        setChapters(updatedChapters);
      } else {
        alert('Failed to generate audio. Please try again.');
      }
    } catch (err) {
      console.error('Error generating audio:', err);
      alert('Failed to generate audio. Please try again.');
    } finally {
      setGeneratingAudio(prev => {
        const newSet = new Set(prev);
        newSet.delete(chapterNumber);
        return newSet;
      });
    }
  };

  const handleNextChapter = () => {
    if (!currentChapter || !chapters.length) return;
    
    const currentIndex = chapters.findIndex(
      ch => ch.chapter_number.toString() === currentChapter
    );
    
    if (currentIndex >= 0 && currentIndex < chapters.length - 1) {
      const nextChapter = chapters[currentIndex + 1];
      setCurrentChapter(nextChapter.chapter_number.toString());
    }
  };

  const handlePrevChapter = () => {
    if (!currentChapter || !chapters.length) return;
    
    const currentIndex = chapters.findIndex(
      ch => ch.chapter_number.toString() === currentChapter
    );
    
    if (currentIndex > 0) {
      const prevChapter = chapters[currentIndex - 1];
      setCurrentChapter(prevChapter.chapter_number.toString());
    }
  };

  const handleChapterComplete = (chapterNumber: string) => {
    // Auto-advance to next chapter
    handleNextChapter();
  };

  const handleDeleteBook = async () => {
    if (!book || !confirm(`Are you sure you want to delete the book "${book.title}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setLoading(true);
      await booksApi.deleteBook(book.id);
      alert(`Book "${book.title}" deleted successfully.`);
      router.push('/'); // Redirect to home page after deletion
    } catch (err) {
      console.error('Error deleting book:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete book');
    } finally {
      setLoading(false);
    }
  };

  const handleBookUpdated = (updatedBook: Book) => {
    setBook(updatedBook);
    setShowEditModal(false);
  };

  const getChapterStatus = (chapter: Chapter) => {
    const chapterStr = chapter.chapter_number.toString();
    
    
    if (generatingAudio.has(chapterStr)) {
      return { status: 'generating', text: 'Generating...' };
    }
    
    if (chapter.hasAudio === true && chapter.audio_path) {
      return { status: 'available', text: 'Ready' };
    }
    
    if (chapter.audio_path) {
      return { status: 'available', text: 'Ready' };
    }
    
    return { status: 'unavailable', text: 'Not available' };
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'Unknown';
    const minutes = Math.round(seconds / 60);
    return `${minutes} min`;
  };

  const getCurrentChapterData = () => {
    if (!currentChapter) return null;
    return chapters.find(ch => ch.chapter_number.toString() === currentChapter);
  };

  const canPlayChapter = (chapterNumber: string) => {
    const chapter = chapters.find(ch => ch.chapter_number.toString() === chapterNumber);
    return (chapter?.hasAudio === true || chapter?.audio_path) && !generatingAudio.has(chapterNumber);
  };

  if (loading) {
    return <div className="loading">Loading book...</div>;
  }

  if (error) {
    return (
      <div>
        <div className="error">{error}</div>
        <Link href="/" className="btn btn-primary">← Back to Books</Link>
      </div>
    );
  }

  if (!book) {
    return (
      <div>
        <div className="error">Book not found</div>
        <Link href="/" className="btn btn-primary">← Back to Books</Link>
      </div>
    );
  }

  const currentChapterData = getCurrentChapterData();

  return (
    <div>
      {/* Book header */}
      <div style={{ marginBottom: '2rem' }}>
        <Link href="/" className="btn btn-secondary btn-small">← Back to Library</Link>
        <button 
          className="btn btn-secondary btn-small" 
          onClick={() => setShowEditModal(true)}
          style={{ marginLeft: '1rem' }}
        >
          ✏️ Edit Book
        </button>
        <button 
          className="btn btn-danger btn-small" 
          onClick={handleDeleteBook}
          style={{ marginLeft: '1rem' }}
        >
          🗑️ Delete Book
        </button>
      </div>
      
      <h1 className="page-title">{book.title}</h1>
      <p style={{ fontSize: '1.2rem', color: '#7f8c8d', marginBottom: '2rem' }}>
        by {book.author}
      </p>

      {/* Book info */}
      <div style={{ 
        background: 'white', 
        padding: '1.5rem', 
        borderRadius: '8px', 
        marginBottom: '2rem',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', gap: '2rem', marginBottom: '1rem' }}>
          <span><strong>Chapters:</strong> {book.total_chapters}</span>
          {book.stats?.totalDuration && (
            <span><strong>Total Duration:</strong> {formatDuration(book.stats.totalDuration)}</span>
          )}
          <span><strong>Added:</strong> {new Date(book.created_at).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Chapter list */}
      <div className="chapter-list">
        <h2 style={{ marginBottom: '1.5rem' }}>📖 Chapters</h2>
        
        {chapters.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#7f8c8d' }}>
            No chapters found for this book.
          </div>
        ) : (
          chapters.map((chapter) => {
            const chapterStr = chapter.chapter_number.toString();
            const status = getChapterStatus(chapter);
            const isCurrentChapter = currentChapter === chapterStr;
            
            return (
              <div 
                key={chapter.id} 
                className="chapter-item"
                style={isCurrentChapter ? { backgroundColor: '#e3f2fd' } : {}}
              >
                <div className="chapter-info">
                  <div className="chapter-title">
                    Chapter {chapter.chapter_number}: {chapter.title}
                    {isCurrentChapter && <span style={{ marginLeft: '0.5rem' }}>🎧</span>}
                  </div>
                  <div className="chapter-meta">
                    <span className={`status-${status.status}`}>
                      {status.text}
                    </span>
                    {chapter.duration && (
                      <span> • Duration: {formatDuration(chapter.duration)}</span>
                    )}
                    {chapter.text_length && (
                      <span> • {chapter.text_length.toLocaleString()} characters</span>
                    )}
                  </div>
                </div>
                
                <div className="chapter-actions">
                  {status.status === 'available' ? (
                    <button
                      className={`btn ${isCurrentChapter ? 'btn-success' : 'btn-primary'} btn-small`}
                      onClick={() => handleChapterSelect(chapterStr)}
                    >
                      {isCurrentChapter ? '🎧 Playing' : '▶️ Play'}
                    </button>
                  ) : status.status === 'generating' ? (
                    <span className="btn btn-secondary btn-small" style={{ cursor: 'not-allowed' }}>
                      ⏳ Generating...
                    </span>
                  ) : (
                    <button
                      className="btn btn-secondary btn-small"
                      onClick={() => handleGenerateAudio(chapterStr)}
                      disabled={generatingAudio.has(chapterStr)}
                    >
                      🎙️ Generate Audio
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Audio player */}
      {currentChapter && currentChapterData && canPlayChapter(currentChapter) && (
        <AudioPlayer
          bookSlug={bookId}
          chapter={currentChapter}
          chapterTitle={`Chapter ${currentChapterData.chapter_number}: ${currentChapterData.title}`}
          totalChapters={book.total_chapters}
          onChapterComplete={handleChapterComplete}
          onNextChapter={handleNextChapter}
          onPrevChapter={handlePrevChapter}
        />
      )}

      {showEditModal && book && (
        <EditBookModal
          book={book}
          onClose={() => setShowEditModal(false)}
          onBookUpdated={handleBookUpdated}
        />
      )}
    </div>
  );
}