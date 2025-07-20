'use client';

import { PipelineJob } from '@/lib/api';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { 
  Download, 
  FileText, 
  Brain, 
  Headphones, 
  CheckCircle, 
  XCircle, 
  Clock,
  AlertCircle,
  Loader2
} from 'lucide-react';

interface PipelineJobCardProps {
  job: PipelineJob;
}

const pipelineSteps = [
  { 
    key: 'downloading', 
    name: 'Download', 
    icon: Download, 
    description: 'Downloading book file' 
  },
  { 
    key: 'parsing', 
    name: 'Extract', 
    icon: FileText, 
    description: 'Extracting text content' 
  },
  { 
    key: 'summarizing', 
    name: 'Summarize', 
    icon: Brain, 
    description: 'AI summarization (optional)' 
  },
  { 
    key: 'generating', 
    name: 'TTS', 
    icon: Headphones, 
    description: 'Generating audio' 
  },
];

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'completed':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'in_progress':
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    default:
      return <Clock className="h-4 w-4 text-gray-400" />;
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'completed':
      return 'bg-green-500';
    case 'failed':
      return 'bg-red-500';
    case 'in_progress':
      return 'bg-blue-500';
    default:
      return 'bg-gray-300';
  }
};

export default function PipelineJobCard({ job }: PipelineJobCardProps) {
  const isCompleted = job.status === 'completed';
  const isFailed = job.status === 'failed';
  
  return (
    <Card className={`transition-colors ${isFailed ? 'border-red-200 bg-red-50' : isCompleted ? 'border-green-200 bg-green-50' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-2">
              {isFailed ? (
                <AlertCircle className="h-5 w-5 text-red-500" />
              ) : isCompleted ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
              )}
              <h3 className="font-semibold">
                {job.bookTitle || job.searchQuery || 'Audiobook Creation'}
              </h3>
            </div>
            {job.bookAuthor && (
              <p className="text-sm text-gray-600 mt-1">by {job.bookAuthor}</p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Started {new Date(job.created_at).toLocaleString()}
            </p>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-gray-700">
              {Math.round(job.progress)}%
            </div>
            <div className="text-xs text-gray-500 capitalize">
              {job.status.replace('_', ' ')}
            </div>
          </div>
        </div>
        
        {/* Overall Progress Bar */}
        <div className="mt-3">
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>Overall Progress</span>
            <span>{job.completedSteps} of {job.totalSteps} steps</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className={`h-2 rounded-full transition-all duration-300 ${
                isFailed ? 'bg-red-500' : isCompleted ? 'bg-green-500' : 'bg-blue-500'
              }`}
              style={{ width: `${job.progress}%` }}
            />
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        {/* Current Step */}
        {job.currentStep && !isCompleted && !isFailed && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center space-x-2">
              <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
              <span className="text-sm font-medium text-blue-700">
                Current: {job.currentStep}
              </span>
            </div>
          </div>
        )}
        
        {/* Detailed Steps */}
        <div className="space-y-3">
          {pipelineSteps.map((step, index) => {
            // Handle both array and object formats for steps
            let stepStatus = 'pending';
            let stepProgress = 0;
            let stepMessage = '';
            
            if (job.steps) {
              if (Array.isArray(job.steps)) {
                // Steps is an array (as per TypeScript interface)
                const stepData = job.steps.find(s => s.name.toLowerCase().includes(step.key));
                stepStatus = stepData?.status || 'pending';
                stepProgress = stepData?.progress || 0;
                stepMessage = stepData?.message || '';
              } else {
                // Steps is an object (as per backend implementation)
                const stepData = (job.steps as any)[step.key];
                if (stepData) {
                  stepStatus = stepData.status || 'pending';
                  stepProgress = stepData.progress || 0;
                  stepMessage = stepData.message || '';
                }
              }
            }
            const Icon = step.icon;
            
            // Determine if this step should be shown as active
            const isActive = job.currentStep?.toLowerCase().includes(step.key) || 
                           (index < job.completedSteps && stepStatus === 'pending');
            
            return (
              <div key={step.key} className="flex items-center space-x-3">
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  stepStatus === 'completed' ? 'bg-green-100' :
                  stepStatus === 'failed' ? 'bg-red-100' :
                  stepStatus === 'in_progress' || isActive ? 'bg-blue-100' :
                  'bg-gray-100'
                }`}>
                  {stepStatus === 'completed' ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : stepStatus === 'failed' ? (
                    <XCircle className="h-4 w-4 text-red-600" />
                  ) : stepStatus === 'in_progress' || isActive ? (
                    <Icon className="h-4 w-4 text-blue-600" />
                  ) : (
                    <Icon className="h-4 w-4 text-gray-400" />
                  )}
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-sm font-medium ${
                        stepStatus === 'completed' ? 'text-green-700' :
                        stepStatus === 'failed' ? 'text-red-700' :
                        stepStatus === 'in_progress' || isActive ? 'text-blue-700' :
                        'text-gray-500'
                      }`}>
                        {step.name}
                      </p>
                      <p className="text-xs text-gray-500">{step.description}</p>
                      {stepMessage && (
                        <p className="text-xs text-gray-600 mt-1">{stepMessage}</p>
                      )}
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      {(stepStatus === 'in_progress' || isActive) && stepProgress > 0 && (
                        <span className="text-xs text-gray-600">{stepProgress}%</span>
                      )}
                      {getStatusIcon(stepStatus === 'pending' && isActive ? 'in_progress' : stepStatus)}
                    </div>
                  </div>
                  
                  {/* Step Progress Bar */}
                  {(stepStatus === 'in_progress' || isActive) && stepProgress > 0 && (
                    <div className="mt-2 w-full bg-gray-200 rounded-full h-1">
                      <div 
                        className={`h-1 rounded-full transition-all duration-300 ${getStatusColor(stepStatus)}`}
                        style={{ width: `${stepProgress}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Error Message */}
        {job.error && (
          <div className="mt-4 p-3 bg-red-50 rounded-lg border border-red-200">
            <div className="flex items-start space-x-2">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-700">Error</p>
                <p className="text-sm text-red-600">{job.error}</p>
              </div>
            </div>
          </div>
        )}
        
        {/* Success Message */}
        {isCompleted && (
          <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <p className="text-sm font-medium text-green-700">
                Audiobook created successfully!
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}