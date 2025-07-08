'use client';

import { useState, useEffect } from 'react';
import { autoDownloadApi, AutoDownloadConfig } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { 
  Settings, 
  Play, 
  Pause, 
  Clock, 
  Plus, 
  Trash2, 
  RefreshCw,
  CheckCircle,
  XCircle
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function AutoDownloadPage() {
  const [config, setConfig] = useState<AutoDownloadConfig>({
    enabled: false,
    interval: 60,
    searchQueries: [],
    maxBooks: 1,
    formats: ['epub', 'pdf']
  });
  const [status, setStatus] = useState<{ enabled: boolean; nextRun?: string; lastRun?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newQuery, setNewQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadConfig();
    loadStatus();
    const interval = setInterval(loadStatus, 10000); // Poll status every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const loadConfig = async () => {
    try {
      const configData = await autoDownloadApi.getConfig();
      if (configData) {
        setConfig(configData);
      }
      setError(null);
    } catch (err) {
      setError('Failed to load auto-download configuration');
      console.error('Failed to load config:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadStatus = async () => {
    try {
      const statusData = await autoDownloadApi.getStatus();
      setStatus(statusData);
    } catch (err) {
      console.error('Failed to load status:', err);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      const success = await autoDownloadApi.updateConfig(config);
      if (success) {
        toast.success('Auto-download configuration saved successfully');
        await loadStatus(); // Refresh status after saving
      } else {
        toast.error('Failed to save configuration');
      }
    } catch (err) {
      toast.error('Failed to save configuration');
      console.error('Failed to save config:', err);
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = () => {
    setConfig(prev => ({ ...prev, enabled: !prev.enabled }));
  };

  const addSearchQuery = () => {
    if (newQuery.trim() && !config.searchQueries.includes(newQuery.trim())) {
      setConfig(prev => ({
        ...prev,
        searchQueries: [...prev.searchQueries, newQuery.trim()]
      }));
      setNewQuery('');
    }
  };

  const removeSearchQuery = (query: string) => {
    setConfig(prev => ({
      ...prev,
      searchQueries: prev.searchQueries.filter(q => q !== query)
    }));
  };

  const toggleFormat = (format: string) => {
    setConfig(prev => ({
      ...prev,
      formats: prev.formats.includes(format)
        ? prev.formats.filter(f => f !== format)
        : [...prev.formats, format]
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
          <p className="text-muted-foreground">Loading auto-download settings...</p>
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
            ⚙️ Auto-Download
          </h1>
          <p className="text-muted-foreground">
            Configure automatic book discovery and audiobook creation
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {status && (
            <div className="flex items-center space-x-2 text-sm">
              {status.enabled ? (
                <>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-green-600">Running</span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-gray-500" />
                  <span className="text-gray-600">Stopped</span>
                </>
              )}
            </div>
          )}
          <Button onClick={loadStatus} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive text-center">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Status Card */}
      {status && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Clock className="h-5 w-5" />
              <span>System Status</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {status.enabled ? (
                    <span className="text-green-600">Active</span>
                  ) : (
                    <span className="text-gray-600">Inactive</span>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">Status</div>
              </div>
              
              {status.nextRun && (
                <div className="text-center">
                  <div className="text-sm font-medium">
                    {new Date(status.nextRun).toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground">Next Run</div>
                </div>
              )}
              
              {status.lastRun && (
                <div className="text-center">
                  <div className="text-sm font-medium">
                    {new Date(status.lastRun).toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground">Last Run</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="h-5 w-5" />
            <span>Configuration</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">Auto-Download</h3>
              <p className="text-sm text-muted-foreground">
                Enable automatic book discovery and audiobook creation
              </p>
            </div>
            <Button
              onClick={toggleEnabled}
              variant={config.enabled ? 'default' : 'outline'}
              className="flex items-center space-x-2"
            >
              {config.enabled ? (
                <>
                  <Pause className="h-4 w-4" />
                  <span>Disable</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  <span>Enable</span>
                </>
              )}
            </Button>
          </div>

          {/* Interval Setting */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Check Interval (minutes)</label>
            <Input
              type="number"
              min="5"
              max="1440"
              value={config.interval}
              onChange={(e) => setConfig(prev => ({
                ...prev,
                interval: parseInt(e.target.value) || 60
              }))}
              className="w-full max-w-xs"
            />
            <p className="text-xs text-muted-foreground">
              How often to search for new books (5-1440 minutes)
            </p>
          </div>

          {/* Max Books Setting */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Maximum Books per Run</label>
            <Input
              type="number"
              min="1"
              max="10"
              value={config.maxBooks}
              onChange={(e) => setConfig(prev => ({
                ...prev,
                maxBooks: parseInt(e.target.value) || 1
              }))}
              className="w-full max-w-xs"
            />
            <p className="text-xs text-muted-foreground">
              Maximum number of books to process in each run (1-10)
            </p>
          </div>

          {/* Format Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Preferred Formats</label>
            <div className="flex flex-wrap gap-2">
              {['epub', 'pdf', 'mobi', 'txt'].map((format) => (
                <Button
                  key={format}
                  variant={config.formats.includes(format) ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => toggleFormat(format)}
                  className="text-xs"
                >
                  {format.toUpperCase()}
                </Button>
              ))}
            </div>
          </div>

          {/* Search Queries */}
          <div className="space-y-4">
            <label className="text-sm font-medium">Search Queries</label>
            
            {/* Add New Query */}
            <div className="flex space-x-2">
              <Input
                type="text"
                placeholder="Enter search query (e.g., 'science fiction 2023')"
                value={newQuery}
                onChange={(e) => setNewQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addSearchQuery()}
                className="flex-1"
              />
              <Button onClick={addSearchQuery} disabled={!newQuery.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Existing Queries */}
            {config.searchQueries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No search queries configured</p>
                <p className="text-sm">Add queries above to enable auto-discovery</p>
              </div>
            ) : (
              <div className="space-y-2">
                {config.searchQueries.map((query, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <span className="font-medium">{query}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeSearchQuery(query)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Save Button */}
          <div className="pt-4 border-t">
            <Button onClick={saveConfig} disabled={saving} className="w-full">
              {saving ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Saving Configuration...
                </>
              ) : (
                <>
                  <Settings className="h-4 w-4 mr-2" />
                  Save Configuration
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Help Section */}
      <Card>
        <CardHeader>
          <CardTitle>How Auto-Download Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>• The system periodically searches for books using your configured queries</p>
          <p>• When new books are found, they are automatically downloaded and converted to audiobooks</p>
          <p>• You can specify preferred formats and the maximum number of books to process per run</p>
          <p>• All processed audiobooks will appear in your library once completed</p>
          <p>• Use specific search terms for better results (e.g., author names, genres, publication years)</p>
        </CardContent>
      </Card>
    </div>
  );
}