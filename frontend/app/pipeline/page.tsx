'use client';

import { useState, useEffect, Suspense } from 'react';
import { pipelineApi, PipelineJob } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import PipelineForm from '@/components/PipelineForm';
import PipelineJobCard from '@/components/PipelineJobCard';
import { 
  RefreshCw,
  FileText
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
              <PipelineJobCard key={job.id} job={job} />
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