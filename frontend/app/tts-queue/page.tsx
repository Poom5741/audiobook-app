'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { booksApi } from '@/lib/api';

interface TTSJob {
  id: string;
  data: any;
  progress: number;
  attemptsMade: number;
  failedReason: string;
  timestamp: number;
  processedOn: number;
  finishedOn: number;
}

interface TTSQueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  waiting: number;
  active: number;
  total: number;
}

export default function TTSQueuePage() {
  const [stats, setStats] = useState<TTSQueueStats | null>(null);
  const [jobs, setJobs] = useState<TTSJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('active');

  useEffect(() => {
    fetchQueueData();
    const interval = setInterval(fetchQueueData, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [filterStatus]);

  const fetchQueueData = async () => {
    try {
      setLoading(true);
      const [statsData, jobsData] = await Promise.all([
        booksApi.getTTSQueueStatus(),
        booksApi.getTTSQueueJobs(filterStatus),
      ]);
      setStats(statsData);
      setJobs(jobsData);
    } catch (err) {
      console.error('Error fetching TTS queue data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load queue data');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timestamp: number) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="container">
      <div style={{ marginBottom: '2rem' }}>
        <Link href="/" className="btn btn-secondary btn-small">← Back to Library</Link>
      </div>
      <h1 className="page-title">🎙️ TTS Generation Queue</h1>

      {error && <div className="alert alert-danger">{error}</div>}

      {stats && (
        <div className="stats-card">
          <h3>Queue Overview</h3>
          <div className="stats-grid">
            <div><strong>Total Jobs:</strong> {stats.total}</div>
            <div><strong>Waiting:</strong> {stats.waiting}</div>
            <div><strong>Active:</strong> {stats.active}</div>
            <div><strong>Completed:</strong> {stats.completed}</div>
            <div><strong>Failed:</strong> {stats.failed}</div>
          </div>
        </div>
      )}

      <div className="filter-controls">
        <label htmlFor="status-filter">Show:</label>
        <select
          id="status-filter"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="form-control"
        >
          <option value="active">Active</option>
          <option value="waiting">Waiting</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="all">All</option>
        </select>
      </div>

      {loading ? (
        <div className="loading">Loading jobs...</div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No {filterStatus} jobs found.
        </div>
      ) : (
        <div className="job-list">
          {jobs.map((job) => (
            <div key={job.id} className="job-item">
              <div className="job-header">
                <h4>Job ID: {job.id}</h4>
                <span className={`job-status status-${filterStatus}`}>{filterStatus}</span>
              </div>
              <div className="job-details">
                <p><strong>Book:</strong> {job.data.bookTitle}</p>
                <p><strong>Chapter:</strong> {job.data.title} (Ch. {job.data.chapterNumber})</p>
                <p><strong>Progress:</strong> {job.progress}%</p>
                <p><strong>Attempts:</strong> {job.attemptsMade}</p>
                {job.failedReason && <p className="text-danger"><strong>Reason:</strong> {job.failedReason}</p>}
                <p><strong>Queued:</strong> {formatTime(job.timestamp)}</p>
                {job.processedOn && <p><strong>Processed:</strong> {formatTime(job.processedOn)}</p>}
                {job.finishedOn && <p><strong>Finished:</strong> {formatTime(job.finishedOn)}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
