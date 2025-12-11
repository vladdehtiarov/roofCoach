'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { ConfirmModal } from '@/components/ui/Modal'
import { DetailPageSkeleton } from '@/components/ui/Skeleton'
import { User } from '@supabase/supabase-js'
import { Recording, Transcript } from '@/types/database'

interface Props {
  recording: Recording
  transcript: Transcript | null
  user: User
}

export default function RecordingDetailClient({ recording, transcript: initialTranscript, user }: Props) {
  const [transcript, setTranscript] = useState<Transcript | null>(initialTranscript)
  const [audioUrl, setAudioUrl] = useState<string>('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [copySuccess, setCopySuccess] = useState(false)
  const [currentStatus, setCurrentStatus] = useState(recording.status)
  const [isLoading, setIsLoading] = useState(true)
  const [showDetails, setShowDetails] = useState(false)
  
  // Delete modal
  const [deleteModal, setDeleteModal] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  
  const router = useRouter()
  const toast = useToast()

  const supabase = useMemo(() => {
    try {
      return createClient()
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    loadAudioUrl()
    if (currentStatus === 'processing') {
      const interval = setInterval(checkStatus, 5000)
      return () => clearInterval(interval)
    }
  }, [currentStatus])

  const loadAudioUrl = async () => {
    if (!supabase) {
      setIsLoading(false)
      return
    }
    
    const { data, error } = await supabase.storage
      .from('audio-files')
      .createSignedUrl(recording.file_path, 3600)
    
    if (!error && data) {
      setAudioUrl(data.signedUrl)
    }
    setIsLoading(false)
  }

  const checkStatus = async () => {
    if (!supabase) return

    const { data } = await supabase
      .from('recordings')
      .select('status')
      .eq('id', recording.id)
      .single()

    if (data && data.status !== currentStatus) {
      setCurrentStatus(data.status)
      if (data.status === 'done') {
        const { data: newTranscript } = await supabase
          .from('transcripts')
          .select('*')
          .eq('recording_id', recording.id)
          .single()
        
        if (newTranscript) {
          setTranscript(newTranscript)
          toast.success('Transcription complete!')
        }
      }
    }
  }

  const handleStartAnalysis = async () => {
    if (!supabase) return
    
    setIsAnalyzing(true)
    setAnalysisError(null)

    try {
      await supabase
        .from('recordings')
        .update({ status: 'processing' })
        .eq('id', recording.id)

      setCurrentStatus('processing')
      toast.info('Analysis started. This may take a few minutes.')

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recordingId: recording.id,
          filePath: recording.file_path,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to start analysis')
      }
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Failed to start analysis')
      toast.error('Failed to start analysis')
      await supabase
        .from('recordings')
        .update({ status: 'done' })
        .eq('id', recording.id)
      setCurrentStatus('done')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleCopyTranscript = async () => {
    if (!transcript?.text) return
    
    try {
      await navigator.clipboard.writeText(transcript.text)
      setCopySuccess(true)
      toast.success('Transcript copied to clipboard')
      setTimeout(() => setCopySuccess(false), 2000)
    } catch {
      toast.error('Failed to copy transcript')
    }
  }

  const handleDelete = async () => {
    if (!supabase) return
    
    setIsDeleting(true)
    try {
      await supabase.storage.from('audio-files').remove([recording.file_path])
      await supabase.from('recordings').delete().eq('id', recording.id)
      toast.success('Recording deleted')
      router.push('/dashboard')
    } catch (err) {
      console.error('Delete error:', err)
      toast.error('Failed to delete recording')
    } finally {
      setIsDeleting(false)
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return 'Unknown duration'
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`
    }
    return `${minutes}m ${secs}s`
  }

  const getStatusConfig = (status: string) => {
    const configs = {
      uploading: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Uploading', icon: '⏳' },
      processing: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'Processing', icon: '🔄' },
      done: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: 'Ready', icon: '✓' },
      error: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Error', icon: '✗' },
    }
    return configs[status as keyof typeof configs] || configs.error
  }

  const statusConfig = getStatusConfig(currentStatus)

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMyMDIwMjAiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRjMC0yIDItNCAyLTRzLTItMi00LTItNCAwLTQgMiAwIDIgMiA0IDQgMiA0IDIgMC0yIDAtMnoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-20 pointer-events-none"></div>
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <DetailPageSkeleton />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMyMDIwMjAiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRjMC0yIDItNCAyLTRzLTItMi00LTItNCAwLTQgMiAwIDIgMiA0IDQgMiA0IDIgMC0yIDAtMnoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-20 pointer-events-none"></div>

      {/* Header */}
      <header className="relative border-b border-slate-700/50 bg-slate-900/50 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="p-2 text-slate-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <Link href="/">
                <Image
                  src="/roof_coach_logo.png"
                  alt="RoofCoach"
                  width={140}
                  height={40}
                  className="h-10 w-auto"
                />
              </Link>
            </div>

            <button
              onClick={() => setDeleteModal(true)}
              className="px-4 py-2 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </header>

      {/* Breadcrumbs */}
      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/dashboard" className="text-slate-400 hover:text-white transition-colors">
            Dashboard
          </Link>
          <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-slate-300 truncate max-w-[200px] sm:max-w-none">{recording.file_name}</span>
        </nav>
      </div>

      {/* Main Content */}
      <main className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        {/* Recording Info Card */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6 mb-6">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-white truncate mb-2">
                {recording.file_name}
              </h1>
              <div className="flex flex-wrap items-center gap-3 text-slate-400 text-sm">
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                  </svg>
                  {formatFileSize(recording.file_size)}
                </span>
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {formatDuration(recording.duration)}
                </span>
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {formatDate(recording.created_at)}
                </span>
              </div>
            </div>
            <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${statusConfig.bg} ${statusConfig.text} flex items-center gap-2 flex-shrink-0`}>
              <span>{statusConfig.icon}</span>
              {statusConfig.label}
            </span>
          </div>

          {/* Audio Player */}
          {audioUrl && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-400 mb-2">Audio Player</label>
              <audio
                controls
                className="w-full h-12 rounded-lg"
                preload="metadata"
                src={audioUrl}
              >
                Your browser does not support the audio element.
              </audio>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            {audioUrl && (
              <a
                href={audioUrl}
                download={recording.file_name}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Audio
              </a>
            )}
            
            {!transcript && currentStatus === 'done' && (
              <button
                onClick={handleStartAnalysis}
                disabled={isAnalyzing}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-medium rounded-lg shadow-lg shadow-amber-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAnalyzing ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Starting Analysis...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    Start AI Analysis
                  </>
                )}
              </button>
            )}

            {currentStatus === 'processing' && (
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/20 text-amber-400 rounded-lg">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Analyzing... This may take a few minutes
              </div>
            )}
          </div>

          {analysisError && (
            <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-red-400 text-sm">{analysisError}</p>
            </div>
          )}
        </div>

        {/* Transcript Section */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-white">Transcript</h2>
            </div>
            
            {transcript && (
              <button
                onClick={handleCopyTranscript}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              >
                {copySuccess ? (
                  <>
                    <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy
                  </>
                )}
              </button>
            )}
          </div>

          {transcript ? (
            <div className="prose prose-invert max-w-none">
              <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700/30 max-h-[500px] overflow-y-auto">
                <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {transcript.text}
                </p>
              </div>
              <p className="text-slate-500 text-sm mt-4">
                Transcribed on {formatDate(transcript.created_at)}
              </p>
            </div>
          ) : currentStatus === 'processing' ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/20 flex items-center justify-center mb-4 animate-pulse-glow">
                <svg className="animate-spin w-8 h-8 text-amber-400" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
              <p className="text-slate-400">AI is analyzing your recording...</p>
              <p className="text-slate-500 text-sm mt-1">This may take several minutes for longer recordings</p>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-slate-700/50 to-slate-800/50 flex items-center justify-center mb-6">
                <svg className="w-10 h-10 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-white mb-2">No transcript yet</h3>
              <p className="text-slate-500 text-sm max-w-sm mx-auto">Click &quot;Start AI Analysis&quot; to transcribe this recording using advanced speech recognition</p>
            </div>
          )}
        </div>

        {/* Technical Details (Collapsible) */}
        <div className="mt-6">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors"
          >
            <svg 
              className={`w-4 h-4 transition-transform ${showDetails ? 'rotate-90' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Technical Details
          </button>
          
          {showDetails && (
            <div className="mt-4 grid sm:grid-cols-2 gap-4 animate-fade-in">
              <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-4">
                <h3 className="text-sm font-medium text-slate-400 mb-2">Recording ID</h3>
                <p className="text-slate-300 font-mono text-sm truncate">{recording.id}</p>
              </div>
              <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-4">
                <h3 className="text-sm font-medium text-slate-400 mb-2">File Path</h3>
                <p className="text-slate-300 font-mono text-sm truncate">{recording.file_path}</p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteModal}
        onClose={() => setDeleteModal(false)}
        onConfirm={handleDelete}
        title="Delete Recording"
        message={`Are you sure you want to delete "${recording.file_name}"? This will permanently remove the audio file and any associated transcripts.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        loading={isDeleting}
      />
    </div>
  )
}
