'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { pipelineApi, PipelineJob } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { 
  PlusCircle, 
  Play, 
  RefreshCw,
  Search,
  Link,
  BookOpen,
  ExternalLink
} from 'lucide-react';

interface PipelineFormProps {
  onJobCreated: () => void;
}

export default function PipelineForm({ onJobCreated }: PipelineFormProps) {
  const searchParams = useSearchParams();
  
  // Tab state
  const [activeTab, setActiveTab] = useState<'search' | 'direct' | 'upload'>('search');
  
  // Search tab state
  const [query, setQuery] = useState('');
  const [formats, setFormats] = useState<string[]>(['epub', 'pdf']);
  const [maxBooks, setMaxBooks] = useState(1);
  
  // Direct link tab state
  const [directUrl, setDirectUrl] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [customAuthor, setCustomAuthor] = useState('');
  
  // File upload tab state
  const [file, setFile] = useState<File | null>(null);

  // Common state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summarize, setSummarize] = useState(false);
  const [summaryStyle, setSummaryStyle] = useState<'concise' | 'detailed' | 'bullets' | 'key-points'>('concise');

  // Handle prefill from discover page
  useEffect(() => {
    const prefillData = searchParams?.get('prefill');
    if (prefillData) {
      try {
        const data = JSON.parse(decodeURIComponent(prefillData));
        if (data.searchQuery) {
          setQuery(data.searchQuery);
        }
      } catch (err) {
        console.error('Failed to parse prefill data:', err);
      }
    }
  }, [searchParams]);

  // Validate Anna's Archive or other valid URLs
  const isValidUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const isAnnaArchiveUrl = (url: string) => {
    return url.includes('annas-archive.org') || url.includes('anna-archive.org');
  };

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const jobId = await pipelineApi.createAudiobook(query, formats, maxBooks, {
        summarize,
        summaryStyle
      });
      if (jobId) {
        onJobCreated();
        setQuery('');
      } else {
        setError('Failed to create audiobook job');
      }
    } catch (err) {
      setError('Failed to create audiobook job');
      console.error('Pipeline error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDirectLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!directUrl.trim() || !isValidUrl(directUrl)) {
      setError('Please enter a valid URL');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Call API to download directly from URL
      const jobId = await pipelineApi.createFromDirectLink({
        url: directUrl,
        title: customTitle || undefined,
        author: customAuthor || undefined,
        formats,
        summarize,
        summaryStyle
      });
      
      if (jobId) {
        onJobCreated();
        setDirectUrl('');
        setCustomTitle('');
        setCustomAuthor('');
      } else {
        setError('Failed to create audiobook from link');
      }
    } catch (err) {
      setError('Failed to create audiobook from link');
      console.error('Direct link error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a file to upload');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('summarize', String(summarize));
      formData.append('summaryStyle', summaryStyle);

      const jobId = await pipelineApi.createFromUpload(formData);

      if (jobId) {
        onJobCreated();
        setFile(null);
      } else {
        setError('Failed to create audiobook from upload');
      }
    } catch (err) {
      setError('Failed to create audiobook from upload');
      console.error('File upload error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <PlusCircle className="h-5 w-5" />
          <span>Create New Audiobook</span>
        </CardTitle>
        
        {/* Tabs */}
        <div className="flex space-x-1 bg-muted rounded-lg p-1 mt-4">
          <button
            type="button"
            onClick={() => setActiveTab('search')}
            className={`flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'search'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Search className="h-4 w-4" />
            <span>Search Books</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('direct')}
            className={`flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'direct'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Link className="h-4 w-4" />
            <span>Direct Link</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'upload'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <BookOpen className="h-4 w-4" />
            <span>Upload File</span>
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Search Tab */}
        {activeTab === 'search' && (
          <form onSubmit={handleSearchSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                Search Query
              </label>
              <Input
                type="text"
                placeholder="Enter book title, author, or keywords..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Preferred Formats
                </label>
                <div className="space-y-2">
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

              <div>
                <label className="text-sm font-medium mb-2 block">
                  Maximum Books
                </label>
                <Input
                  type="number"
                  min="1"
                  max="5"
                  value={maxBooks}
                  onChange={(e) => setMaxBooks(parseInt(e.target.value) || 1)}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Number of books to convert (1-5)
                </p>
              </div>
            </div>

            {/* AI Summarization Options */}
            <div className="border-t pt-4">
              <div className="flex items-center space-x-2 mb-3">
                <input
                  type="checkbox"
                  id="summarize"
                  checked={summarize}
                  onChange={(e) => setSummarize(e.target.checked)}
                  className="rounded border-input"
                />
                <label htmlFor="summarize" className="text-sm font-medium cursor-pointer">
                  🧠 AI Summarization (Extract key insights only)
                </label>
              </div>
              
              {summarize && (
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Summary Style
                  </label>
                  <select
                    value={summaryStyle}
                    onChange={(e) => setSummaryStyle(e.target.value as any)}
                    className="w-full px-3 py-2 border border-input rounded-md bg-background"
                  >
                    <option value="concise">Concise (2-3 paragraphs)</option>
                    <option value="detailed">Detailed (preserves context)</option>
                    <option value="bullets">Bullet Points (actionable items)</option>
                    <option value="key-points">Key Points (numbered insights)</option>
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">
                    🥥 Extract the "coconut milk" from watery content
                  </p>
                </div>
              )}
            </div>

            {error && (
              <div className="p-3 bg-destructive/20 text-destructive rounded-lg text-sm">
                {error}
              </div>
            )}

            <Button type="submit" disabled={loading || !query.trim()} className="w-full">
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Creating Audiobook...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Search & Create
                </>
              )}
            </Button>
          </form>
        )}

        {/* Direct Link Tab */}
        {activeTab === 'direct' && (
          <form onSubmit={handleDirectLinkSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                Direct Link URL
              </label>
              <div className="relative">
                <Input
                  type="url"
                  placeholder="https://annas-archive.org/md5/... or other book download link"
                  value={directUrl}
                  onChange={(e) => setDirectUrl(e.target.value)}
                  className="w-full pl-10"
                />
                <ExternalLink className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
              </div>
              {directUrl && isAnnaArchiveUrl(directUrl) && (
                <p className="text-xs text-green-600 mt-1 flex items-center space-x-1">
                  <BookOpen className="h-3 w-3" />
                  <span>✓ Anna's Archive link detected</span>
                </p>
              )}
              {directUrl && !isValidUrl(directUrl) && (
                <p className="text-xs text-red-600 mt-1">
                  Please enter a valid URL
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Title (Optional)
                </label>
                <Input
                  type="text"
                  placeholder="Book title (auto-detected if not provided)"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Author (Optional)
                </label>
                <Input
                  type="text"
                  placeholder="Author name (auto-detected if not provided)"
                  value={customAuthor}
                  onChange={(e) => setCustomAuthor(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">
                Preferred Formats
              </label>
              <div className="grid grid-cols-2 gap-2">
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

            {/* AI Summarization Options */}
            <div className="border-t pt-4">
              <div className="flex items-center space-x-2 mb-3">
                <input
                  type="checkbox"
                  id="summarize-direct"
                  checked={summarize}
                  onChange={(e) => setSummarize(e.target.checked)}
                  className="rounded border-input"
                />
                <label htmlFor="summarize-direct" className="text-sm font-medium cursor-pointer">
                  🧠 AI Summarization (Extract key insights only)
                </label>
              </div>
              
              {summarize && (
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Summary Style
                  </label>
                  <select
                    value={summaryStyle}
                    onChange={(e) => setSummaryStyle(e.target.value as any)}
                    className="w-full px-3 py-2 border border-input rounded-md bg-background"
                  >
                    <option value="concise">Concise (2-3 paragraphs)</option>
                    <option value="detailed">Detailed (preserves context)</option>
                    <option value="bullets">Bullet Points (actionable items)</option>
                    <option value="key-points">Key Points (numbered insights)</option>
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">
                    🥥 Extract the "coconut milk" from watery content
                  </p>
                </div>
              )}
            </div>

            {error && (
              <div className="p-3 bg-destructive/20 text-destructive rounded-lg text-sm">
                {error}
              </div>
            )}

            <Button type="submit" disabled={loading || !directUrl.trim() || !isValidUrl(directUrl)} className="w-full">
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Processing Link...
                </>
              ) : (
                <>
                  <Link className="h-4 w-4 mr-2" />
                  Download & Create
                </>
              )}
            </Button>
          </form>
        )}

        {/* File Upload Tab */}
        {activeTab === 'upload' && (
          <form onSubmit={handleFileUploadSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                Upload Book File
              </label>
              <Input
                type="file"
                accept=".pdf,.epub,.txt"
                onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
                className="w-full"
              />
            </div>

            {/* AI Summarization Options - Re-use from Direct Link tab for consistency */}
            <div className="border-t pt-4">
              <div className="flex items-center space-x-2 mb-3">
                <input
                  type="checkbox"
                  id="summarize-upload"
                  checked={summarize}
                  onChange={(e) => setSummarize(e.target.checked)}
                  className="rounded border-input"
                />
                <label htmlFor="summarize-upload" className="text-sm font-medium cursor-pointer">
                  🧠 AI Summarization (Extract key insights only)
                </label>
              </div>
              
              {summarize && (
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Summary Style
                  </label>
                  <select
                    value={summaryStyle}
                    onChange={(e) => setSummaryStyle(e.target.value as any)}
                    className="w-full px-3 py-2 border border-input rounded-md bg-background"
                  >
                    <option value="concise">Concise (2-3 paragraphs)</option>
                    <option value="detailed">Detailed (preserves context)</option>
                    <option value="bullets">Bullet Points (actionable items)</option>
                    <option value="key-points">Key Points (numbered insights)</option>
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">
                    🥥 Extract the "coconut milk" from watery content
                  </p>
                </div>
              )}
            </div>

            {error && (
              <div className="p-3 bg-destructive/20 text-destructive rounded-lg text-sm">
                {error}
              </div>
            )}

            <Button type="submit" disabled={loading || !file} className="w-full">
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Uploading & Processing...
                </>
              ) : (
                <>
                  <BookOpen className="h-4 w-4 mr-2" />
                  Upload & Create
                </>
              )}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}