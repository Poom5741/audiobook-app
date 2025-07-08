'use client';

import { useState, useEffect } from 'react';
import { downloadApi, DownloadJob } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { 
  Download, 
  Clock, 
  CheckCircle, 
  XCircle, 
  RefreshCw,
  FileText,
  Trash2
} from 'lucide-react';

export default function DownloadsPage() {
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadJobs();
    const interval = setInterval(loadJobs, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const loadJobs = async () => {
    try {
      const jobsData = await downloadApi.getDownloadJobs();
      setJobs(jobsData);
      setError(null);
    } catch (err) {
      setError('Failed to load download jobs');
      console.error('Failed to load jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: DownloadJob['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'downloading':
        return <Download className="h-4 w-4 text-blue-500 animate-pulse" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: DownloadJob['status']) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-500/20 text-yellow-700';
      case 'downloading':
        return 'bg-blue-500/20 text-blue-700';
      case 'completed':
        return 'bg-green-500/20 text-green-700';
      case 'failed':
        return 'bg-red-500/20 text-red-700';
      default:
        return 'bg-gray-500/20 text-gray-700';
    }
  };

  const formatFileSize = (size?: string) => {
    if (!size) return 'Unknown size';
    return size;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
          <p className="text-muted-foreground">Loading downloads...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-gradient mb-2">
            📥 Downloads
          </h1>
          <p className="text-muted-foreground">
            Track your book download progress and manage completed downloads
          </p>
        </div>
        <Button variant="outline" onClick={loadJobs}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive text-center">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Downloads List */}
      {jobs.length === 0 ? (
        <div className="text-center py-16">
          <Card className="max-w-md mx-auto">
            <CardContent className="pt-6">
              <Download className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <CardTitle className="mb-2">No Downloads Yet</CardTitle>
              <p className="text-muted-foreground mb-6">
                Start downloading books from the discover page or create audiobooks via the pipeline
              </p>
              <div className="space-y-2">
                <Button className="w-full" onClick={() => window.location.href = '/discover'}>
                  Discover Books
                </Button>
                <Button variant="outline" className="w-full" onClick={() => window.location.href = '/pipeline'}>
                  Create Audiobook
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Download Jobs</h2>
            <p className="text-muted-foreground">
              {jobs.length} download{jobs.length !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {jobs.map((job) => (
              <Card key={job.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        {getStatusIcon(job.status)}
                        <h3 className="font-semibold">{job.title}</h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(job.status)}`}>
                          {job.status}
                        </span>
                      </div>
                      <p className="text-muted-foreground text-sm">by {job.author}</p>
                      <div className="flex items-center space-x-4 text-sm text-muted-foreground mt-2">
                        <div className="flex items-center space-x-1">
                          <FileText className="h-4 w-4" />
                          <span className="uppercase font-medium">{job.format}</span>
                        </div>
                        {job.url && (
                          <a 
                            href={job.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            View Source
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      {new Date(job.created_at).toLocaleString()}
                    </div>
                  </div>

                  {/* Progress Bar for Downloading */}
                  {job.status === 'downloading' && (
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">Downloading...</span>
                        <span>{job.progress}%</span>
                      </div>
                      <div className="w-full bg-secondary rounded-full h-2">
                        <div 
                          className="bg-primary h-2 rounded-full transition-all duration-300" 
                          style={{ width: `${job.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Error Message */}
                  {job.error && (
                    <div className="bg-destructive/20 text-destructive p-3 rounded-lg text-sm mb-4">
                      <strong>Error:</strong> {job.error}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center justify-between">
                    <div className="flex space-x-2">
                      {job.status === 'completed' && (
                        <Button size="sm" variant="outline">
                          <FileText className="h-4 w-4 mr-2" />
                          View File
                        </Button>
                      )}
                      {job.status === 'failed' && (
                        <Button size="sm" variant="outline">
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Retry
                        </Button>
                      )}
                    </div>
                    
                    <Button size="sm" variant="outline" className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Statistics */}
      {jobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Download Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {jobs.filter(j => j.status === 'completed').length}
                </div>
                <div className="text-sm text-muted-foreground">Completed</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {jobs.filter(j => j.status === 'downloading').length}
                </div>
                <div className="text-sm text-muted-foreground">Downloading</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-600">
                  {jobs.filter(j => j.status === 'pending').length}
                </div>
                <div className="text-sm text-muted-foreground">Pending</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">
                  {jobs.filter(j => j.status === 'failed').length}
                </div>
                <div className="text-sm text-muted-foreground">Failed</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}