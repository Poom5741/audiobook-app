'use client';

import { useState, useEffect, Suspense } from 'react';
import { pipelineApi, PipelineJob } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import PipelineForm from '@/components/PipelineForm';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  Search,
  Download,
  FileText,
  Mic,
  RefreshCw
} from 'lucide-react';

function PipelineJobs() {
  const [jobs, setJobs] = useState<PipelineJob[]>([]);

  // Load existing jobs
  useEffect(() => {
    loadJobs();
    const interval = setInterval(loadJobs, 3000); // Poll every 3 seconds
    return () => clearInterval(interval);
  }, []);

  const loadJobs = async () => {
    try {
      const jobsData = await pipelineApi.getPipelineJobs();
      setJobs(jobsData);
    } catch (err) {
      console.error('Failed to load jobs:', err);
    }
  };

  const getStatusIcon = (status: PipelineJob['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'searching':
        return <Search className="h-4 w-4 text-blue-500 animate-pulse" />;
      case 'downloading':
        return <Download className="h-4 w-4 text-blue-500 animate-pulse" />;
      case 'parsing':
        return <FileText className="h-4 w-4 text-blue-500 animate-pulse" />;
      case 'generating':
        return <Mic className="h-4 w-4 text-blue-500 animate-pulse" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: PipelineJob['status']) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-500/20 text-yellow-700';
      case 'searching':
      case 'downloading':
      case 'parsing':
      case 'generating':
        return 'bg-blue-500/20 text-blue-700';
      case 'completed':
        return 'bg-green-500/20 text-green-700';
      case 'failed':
        return 'bg-red-500/20 text-red-700';
      default:
        return 'bg-gray-500/20 text-gray-700';
    }
  };

  return (
    <>
      {/* Pipeline Jobs */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Pipeline Jobs</h2>
          <Button variant="outline" size="sm" onClick={loadJobs}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {jobs.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center">
              <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold mb-2">No Pipeline Jobs Yet</h3>
              <p className="text-muted-foreground">
                Create your first audiobook using the form above
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {jobs.map((job) => (
              <Card key={job.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        {getStatusIcon(job.status)}
                        <h3 className="font-semibold">
                          {job.bookTitle || job.searchQuery}
                        </h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(job.status)}`}>
                          {job.status}
                        </span>
                      </div>
                      {job.bookAuthor && (
                        <p className="text-muted-foreground text-sm">by {job.bookAuthor}</p>
                      )}
                      <p className="text-sm text-muted-foreground mt-1">
                        Query: {job.searchQuery}
                      </p>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      {new Date(job.created_at).toLocaleString()}
                    </div>
                  </div>

                  {/* Progress */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{job.currentStep}</span>
                      <span>{job.completedSteps}/{job.totalSteps} steps</span>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div 
                        className="bg-primary h-2 rounded-full transition-all duration-300" 
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>
                    {job.error && (
                      <div className="text-sm text-destructive mt-2">
                        Error: {job.error}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export default function PipelinePage() {
  const [jobs, setJobs] = useState<PipelineJob[]>([]);

  const loadJobs = async () => {
    try {
      const jobsData = await pipelineApi.getPipelineJobs();
      setJobs(jobsData);
    } catch (err) {
      console.error('Failed to load jobs:', err);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-gradient mb-2">
          🎵 Audiobook Pipeline
        </h1>
        <p className="text-muted-foreground">
          Convert books into audiobooks automatically with our AI-powered pipeline
        </p>
      </div>

      {/* Create New Audiobook */}
      <Suspense fallback={<div>Loading form...</div>}>
        <PipelineForm onJobCreated={loadJobs} />
      </Suspense>

      {/* Pipeline Jobs */}
      <PipelineJobs />
    </div>
  );
}