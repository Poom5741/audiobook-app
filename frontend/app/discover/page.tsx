'use client';

import { useState } from 'react';
import { searchApi, SearchResult } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Search, BookOpen, Download, ExternalLink } from 'lucide-react';
import Link from 'next/link';

export default function DiscoverPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formats, setFormats] = useState<string[]>(['epub', 'pdf']);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    
    try {
      const searchResults = await searchApi.searchBooks(query, formats);
      setResults(searchResults);
    } catch (err) {
      setError('Failed to search books. Please try again.');
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (size?: string) => {
    if (!size) return 'Unknown size';
    return size;
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-gradient mb-2">
          🔍 Discover Books
        </h1>
        <p className="text-muted-foreground">
          Search and discover books from Anna&apos;s Archive to add to your library
        </p>
      </div>

      {/* Search Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Search className="h-5 w-5" />
            <span>Search Books</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="flex space-x-4">
              <div className="flex-1">
                <Input
                  type="text"
                  placeholder="Enter book title, author, or keywords..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full"
                />
              </div>
              <Button type="submit" disabled={loading || !query.trim()}>
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin mr-2" />
                ) : (
                  <Search className="h-4 w-4 mr-2" />
                )}
                Search
              </Button>
            </div>

            {/* Format Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Preferred Formats:</label>
              <div className="flex space-x-4">
                {['epub', 'pdf', 'mobi', 'txt'].map((format) => (
                  <label key={format} className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formats.includes(format)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFormats([...formats, format]);
                        } else {
                          setFormats(formats.filter(f => f !== format));
                        }
                      }}
                      className="rounded border-input"
                    />
                    <span className="text-sm uppercase font-medium">{format}</span>
                  </label>
                ))}
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Error State */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive text-center">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="flex flex-col items-center space-y-4">
            <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
            <p className="text-muted-foreground">Searching for books...</p>
          </div>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && !loading && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Search Results</h2>
            <p className="text-muted-foreground">
              Found {results.length} book{results.length !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {results.map((book) => (
              <Card key={book.id} className="h-full">
                <CardHeader>
                  <CardTitle className="line-clamp-2">{book.title}</CardTitle>
                  <p className="text-muted-foreground">by {book.author}</p>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="px-2 py-1 bg-secondary rounded text-xs font-medium uppercase">
                      {book.format}
                    </span>
                    {book.year && (
                      <span className="text-muted-foreground">{book.year}</span>
                    )}
                  </div>
                  
                  {book.size && (
                    <p className="text-sm text-muted-foreground">
                      Size: {formatFileSize(book.size)}
                    </p>
                  )}

                  <div className="flex space-x-2">
                    <Link 
                      href={`/pipeline?prefill=${encodeURIComponent(JSON.stringify({
                        searchQuery: `${book.title} ${book.author}`,
                        title: book.title,
                        author: book.author,
                        format: book.format
                      }))}`}
                      className="flex-1"
                    >
                      <Button className="w-full" size="sm">
                        <Download className="h-4 w-4 mr-2" />
                        Create Audiobook
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(book.url, '_blank')}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Empty Results */}
      {results.length === 0 && !loading && query && !error && (
        <div className="text-center py-16">
          <Card className="max-w-md mx-auto">
            <CardContent className="pt-6">
              <BookOpen className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <CardTitle className="mb-2">No Results Found</CardTitle>
              <p className="text-muted-foreground mb-6">
                No books found for &quot;{query}&quot;. Try different keywords or check your spelling.
              </p>
              <Button onClick={() => setQuery('')} variant="outline">
                Clear Search
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}