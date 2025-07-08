'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { booksApi, Book } from '@/lib/api';
import { progressStorage, BookProgress } from '@/lib/storage';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { BookOpen, Clock, Play, Plus } from 'lucide-react';

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
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
          <p className="text-muted-foreground">Loading your audiobook library...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-destructive font-medium">{error}</p>
            <Button 
              onClick={loadBooks} 
              variant="outline" 
              className="mt-4"
            >
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-gradient mb-2">
            📚 Your Audiobook Library
          </h1>
          <p className="text-muted-foreground">
            {books.length === 0 
              ? "No books found - add some books to get started" 
              : `${books.length} book${books.length !== 1 ? 's' : ''} in your library`
            }
          </p>
        </div>
        <Link href="/pipeline">
          <Button className="flex items-center space-x-2">
            <Plus className="h-4 w-4" />
            <span>Add Book</span>
          </Button>
        </Link>
      </div>
      
      {books.length === 0 ? (
        <div className="text-center py-16">
          <Card className="max-w-md mx-auto">
            <CardContent className="pt-6">
              <BookOpen className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <CardTitle className="mb-2">No Books Yet</CardTitle>
              <p className="text-muted-foreground mb-6">
                Start building your audiobook library by adding your first book
              </p>
              <div className="space-y-2">
                <Link href="/pipeline">
                  <Button className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Audiobook
                  </Button>
                </Link>
                <Link href="/discover">
                  <Button variant="outline" className="w-full">
                    <BookOpen className="h-4 w-4 mr-2" />
                    Discover Books
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {books.map((book) => {
            const bookProgress = progress[book.slug];
            const progressPercent = getProgressPercentage(book.slug, book.total_chapters);
            
            return (
              <Link key={book.id} href={`/book/${book.slug}`}>
                <Card className="h-full hover:shadow-lg transition-all duration-200 hover:scale-[1.02] cursor-pointer group">
                  <CardHeader>
                    <CardTitle className="line-clamp-2 group-hover:text-primary transition-colors">
                      {book.title}
                    </CardTitle>
                    <p className="text-muted-foreground">by {book.author}</p>
                  </CardHeader>
                  
                  <CardContent className="space-y-4">
                    {/* Book Stats */}
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <div className="flex items-center space-x-1">
                        <BookOpen className="h-4 w-4" />
                        <span>{book.total_chapters} chapter{book.total_chapters !== 1 ? 's' : ''}</span>
                      </div>
                      {book.total_duration && (
                        <div className="flex items-center space-x-1">
                          <Clock className="h-4 w-4" />
                          <span>{Math.round(book.total_duration / 60)}m</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Progress */}
                    {bookProgress ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">
                            {progressPercent === 100 ? '✅ Completed' : `📖 ${progressPercent}% complete`}
                          </span>
                          {progressPercent < 100 && (
                            <span className="text-muted-foreground">
                              Ch. {bookProgress.currentChapter}
                            </span>
                          )}
                        </div>
                        <div className="w-full bg-secondary rounded-full h-2">
                          <div 
                            className="bg-primary h-2 rounded-full transition-all duration-300" 
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Last accessed: {new Date(bookProgress.lastAccessed).toLocaleDateString()}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-center py-4 border-2 border-dashed border-muted rounded-lg">
                          <div className="flex items-center space-x-2 text-muted-foreground">
                            <Play className="h-4 w-4" />
                            <span className="text-sm">Ready to start</span>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <p className="text-xs text-muted-foreground">
                      Added {formatDate(book.created_at)}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}