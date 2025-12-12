'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { ConfirmModal } from '@/components/ui/Modal'
import { DetailPageSkeleton } from '@/components/ui/Skeleton'
import AudioEditor from '@/components/AudioEditor'
import AnalysisDisplay from '@/components/AnalysisDisplay'
import TagManager from '@/components/TagManager'
import BookmarkManager from '@/components/BookmarkManager'
import CommentsManager from '@/components/CommentsManager'
import ExportButton from '@/components/ExportButton'
import { User } from '@supabase/supabase-js'
import { Recording, Transcript, AudioAnalysis, Tag } from '@/types/database'

interface Props {
  recording: Recording
  transcript: Transcript | null
  analysis: AudioAnalysis | null
  user: User
}

export default function RecordingDetailClient({ recording, transcript: initialTranscript, analysis: initialAnalysis, user }: Props) {
  const [transcript, setTranscript] = useState<Transcript | null>(initialTranscript)
  const [analysis, setAnalysis] = useState<AudioAnalysis | null>(initialAnalysis)
  const [audioUrl, setAudioUrl] = useState<string>('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [copySuccess, setCopySuccess] = useState(false)
  const [currentStatus, setCurrentStatus] = useState(recording.status)
  const [isLoading, setIsLoading] = useState(true)
  const [showDetails, setShowDetails] = useState(false)
  
  // Rename state
  const [isEditing, setIsEditing] = useState(false)
  const [fileName, setFileName] = useState(recording.file_name)
  const [isSavingName, setIsSavingName] = useState(false)
  
  // Audio player controls
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [currentTime, setCurrentTime] = useState(0)
  
  // Tags
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [recordingTags, setRecordingTags] = useState<Tag[]>([])
  
  // Progress tracking
  const [analysisProgress, setAnalysisProgress] = useState<{
    status: 'pending' | 'processing' | 'done' | 'error' | 'queued'
    totalChunks: number
    completedChunks: number
    message: string
  }>({
    status: (initialAnalysis?.processing_status as 'pending' | 'processing' | 'done' | 'error') || 'pending',
    totalChunks: initialAnalysis?.total_chunks || 0,
    completedChunks: initialAnalysis?.completed_chunks || 0,
    message: initialAnalysis?.current_chunk_message || '',
  })
  
  // Delete modal
  const [deleteModal, setDeleteModal] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  
  // Editor
  const [showEditor, setShowEditor] = useState(false)
  
  // Tab navigation
  type TabType = 'overview' | 'analysis' | 'edit'
  const [activeTab, setActiveTab] = useState<TabType>('analysis')
  
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
    loadRecordingTags()
    
    // Subscribe to realtime updates for this analysis
    if (supabase && recording.id) {
      const channel = supabase
        .channel(`analysis-${recording.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'audio_analyses',
            filter: `recording_id=eq.${recording.id}`,
          },
          (payload) => {
            console.log('Realtime update:', payload.new)
            const updated = payload.new as AudioAnalysis
            setAnalysis(updated)
            setAnalysisProgress({
              status: updated.processing_status || 'pending',
              totalChunks: updated.total_chunks || 0,
              completedChunks: updated.completed_chunks || 0,
              message: updated.current_chunk_message || '',
            })
            
            if (updated.processing_status === 'done') {
              setIsAnalyzing(false)
              setCurrentStatus('done')
              toast.success('Analysis complete!')
            } else if (updated.processing_status === 'error') {
              setIsAnalyzing(false)
              setAnalysisError(updated.error_message || 'Analysis failed')
              toast.error('Analysis failed')
            }
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }
  }, [recording.id, supabase])

  // Polling fallback for when realtime doesn't work
  useEffect(() => {
    if (currentStatus === 'processing' || analysisProgress.status === 'processing' || analysisProgress.status === 'queued') {
      const interval = setInterval(checkStatus, 10000)
      return () => clearInterval(interval)
    }
  }, [currentStatus, analysisProgress.status])

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

  const loadRecordingTags = async () => {
    if (!supabase) return
    
    try {
      const { data, error } = await supabase
        .from('recording_tags')
        .select('tag_id, tags(*)')
        .eq('recording_id', recording.id)
      
      if (!error && data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tags = data.map((rt: any) => rt.tags).filter(Boolean) as Tag[]
        setRecordingTags(tags)
        setSelectedTags(tags.map(t => t.id))
      }
    } catch (err) {
      console.error('Error loading tags:', err)
    }
  }

  const handleTagsChange = async (newTagIds: string[]) => {
    if (!supabase) return
    
    const currentTagIds = selectedTags
    const toAdd = newTagIds.filter(id => !currentTagIds.includes(id))
    const toRemove = currentTagIds.filter(id => !newTagIds.includes(id))

    // Add new tags
    for (const tagId of toAdd) {
      await supabase.from('recording_tags').insert({
        recording_id: recording.id,
        tag_id: tagId,
      })
    }

    // Remove old tags
    for (const tagId of toRemove) {
      await supabase.from('recording_tags')
        .delete()
        .eq('recording_id', recording.id)
        .eq('tag_id', tagId)
    }

    setSelectedTags(newTagIds)
    loadRecordingTags() // Reload to get full tag objects
  }

  const checkStatus = async () => {
    if (!supabase) return

    // Check analysis progress
    const { data: analysisData } = await supabase
      .from('audio_analyses')
      .select('*')
      .eq('recording_id', recording.id)
      .single()

    if (analysisData) {
      setAnalysis(analysisData as AudioAnalysis)
      setAnalysisProgress({
        status: analysisData.processing_status || 'pending',
        totalChunks: analysisData.total_chunks || 0,
        completedChunks: analysisData.completed_chunks || 0,
        message: analysisData.current_chunk_message || '',
      })

      if (analysisData.processing_status === 'done') {
        setCurrentStatus('done')
        setIsAnalyzing(false)
        toast.success('Analysis complete!')

        // Also load transcript for backward compatibility
        const { data: newTranscript } = await supabase
          .from('transcripts')
          .select('*')
          .eq('recording_id', recording.id)
          .single()
        
        if (newTranscript) {
          setTranscript(newTranscript)
        }
      } else if (analysisData.processing_status === 'error') {
        setIsAnalyzing(false)
        setAnalysisError(analysisData.error_message || 'Analysis failed')
      }
    }

    // Also check recording status
    const { data: recordingData } = await supabase
      .from('recordings')
      .select('status')
      .eq('id', recording.id)
      .single()

    if (recordingData && recordingData.status !== currentStatus) {
      setCurrentStatus(recordingData.status)
    }
  }

  const handleStartAnalysis = async () => {
    if (!supabase) return
    
    setIsAnalyzing(true)
    setAnalysisError(null)

    try {
      setCurrentStatus('processing')
      setAnalysisProgress({
        status: 'processing',
        totalChunks: 0,
        completedChunks: 0,
        message: 'Starting analysis...',
      })

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recordingId: recording.id,
          filePath: recording.file_path,
        }),
      })

      const result = await response.json()

      // Handle queue response (503 - server busy)
      if (response.status === 503 && result.queued) {
        setAnalysisProgress({
          status: 'queued',
          totalChunks: 0,
          completedChunks: 0,
          message: `Server busy (${result.activeCount}/${result.maxConcurrent} analyses running). Retrying in 60 seconds...`,
        })
        toast.warning(`Server is processing other files. Your analysis will start automatically in ~1 minute.`)
        
        // Auto-retry after delay
        setTimeout(() => {
          handleStartAnalysis()
        }, (result.retryAfterSeconds || 60) * 1000)
        return
      }

      if (!response.ok) {
        throw new Error(result.message || 'Failed to start analysis')
      }
      
      // Update progress from response
      setAnalysisProgress({
        status: 'processing',
        totalChunks: result.totalChunks || 0,
        completedChunks: 0,
        message: `Processing ${result.totalChunks} chunks (est. ${result.estimatedMinutes} min)...`,
      })
      
      toast.info(`Analysis started! Processing ${result.totalChunks} chunks. Estimated time: ${result.estimatedMinutes} minutes.`)
      
      // Don't set isAnalyzing to false - realtime subscription will handle that
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Failed to start analysis')
      toast.error('Failed to start analysis')
      setCurrentStatus('done')
      setIsAnalyzing(false)
      setAnalysisProgress(prev => ({ ...prev, status: 'error' }))
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

  const handleRename = async () => {
    if (!supabase || !fileName.trim() || fileName === recording.file_name) {
      setIsEditing(false)
      setFileName(recording.file_name)
      return
    }

    setIsSavingName(true)
    try {
      const { error } = await supabase
        .from('recordings')
        .update({ file_name: fileName.trim() })
        .eq('id', recording.id)

      if (error) throw error
      
      toast.success('Recording renamed')
      setIsEditing(false)
      // Update the recording object for display
      recording.file_name = fileName.trim()
    } catch (err) {
      console.error('Rename error:', err)
      toast.error('Failed to rename recording')
      setFileName(recording.file_name)
    } finally {
      setIsSavingName(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRename()
    } else if (e.key === 'Escape') {
      setIsEditing(false)
      setFileName(recording.file_name)
    }
  }

  const handleSaveEditedAudio = async (blob: Blob, newFileName: string) => {
    if (!supabase) return

    try {
      // Upload new file
      const newFilePath = `${user.id}/${newFileName}`
      
      const { error: uploadError } = await supabase.storage
        .from('audio-files')
        .upload(newFilePath, blob, {
          contentType: 'audio/wav',
          cacheControl: '3600',
        })

      if (uploadError) throw uploadError

      // Delete old file
      await supabase.storage.from('audio-files').remove([recording.file_path])

      // Update recording in database
      const { error: updateError } = await supabase
        .from('recordings')
        .update({
          file_path: newFilePath,
          file_name: newFileName,
          file_size: blob.size,
        })
        .eq('id', recording.id)

      if (updateError) throw updateError

      // Refresh the page to show updated recording
      setShowEditor(false)
      router.refresh()
    } catch (err) {
      console.error('Save edited audio error:', err)
      throw err
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

  // Parse timestamp string to seconds (handles "1:23:45", "23:45", "45")
  const parseTimestamp = (timestamp: string): number => {
    const parts = timestamp.split(':').map(Number)
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2]
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1]
    }
    return parts[0] || 0
  }

  // Jump to specific timestamp in audio
  const seekToTimestamp = (timestamp: string) => {
    if (audioRef.current) {
      const seconds = parseTimestamp(timestamp)
      audioRef.current.currentTime = seconds
      audioRef.current.play()
      toast.info(`Playing from ${timestamp}`)
    }
  }

  // Change playback speed
  const changePlaybackSpeed = (speed: number) => {
    setPlaybackSpeed(speed)
    if (audioRef.current) {
      audioRef.current.playbackRate = speed
    }
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
                  src="/Logo.svg"
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
          <span className="text-slate-300 truncate max-w-[200px] sm:max-w-none">{fileName}</span>
        </nav>
      </div>

      {/* Main Content */}
      <main className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        {/* Recording Info Card */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6 mb-6">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex-1 min-w-0">
              {/* Editable Title */}
              {isEditing ? (
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    value={fileName}
                    onChange={(e) => setFileName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={handleRename}
                    autoFocus
                    className="text-2xl font-bold text-white bg-slate-700/50 border border-amber-500/50 rounded-lg px-3 py-1 w-full focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    disabled={isSavingName}
                  />
                  {isSavingName && (
                    <svg className="animate-spin w-5 h-5 text-amber-400 flex-shrink-0" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 group mb-2">
                  <h1 className="text-2xl font-bold text-white truncate">
                    {fileName}
                  </h1>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="p-1.5 text-slate-500 hover:text-amber-400 opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-slate-700/50"
                    title="Rename"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3 text-slate-400 text-sm">
                {/* Playback file size */}
                <span className="flex items-center gap-1" title="Original file size (for playback)">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15.536a5 5 0 001.414 1.414m2.828-9.9a9 9 0 012.728-2.728" />
                  </svg>
                  {formatFileSize(recording.file_size)}
                </span>
                {/* AI file size */}
                {recording.analysis_file_size && (
                  <span className="flex items-center gap-1 text-purple-400" title="Compressed file size (for AI analysis)">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    AI: {formatFileSize(recording.analysis_file_size)}
                  </span>
                )}
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
              
              {/* Tags */}
              <div className="mt-3">
                <TagManager
                  userId={user.id}
                  recordingId={recording.id}
                  selectedTags={selectedTags}
                  onTagsChange={handleTagsChange}
                  compact={true}
                />
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${statusConfig.bg} ${statusConfig.text} flex items-center gap-2 flex-shrink-0`}>
                <span>{statusConfig.icon}</span>
                {statusConfig.label}
              </span>
              {/* Export button */}
              <ExportButton recording={recording} analysis={analysis} />
            </div>
          </div>

          {/* Audio Player */}
          {audioUrl && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-400">Audio Player</label>
                {/* Playback Speed Control */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Speed:</span>
                  <div className="flex bg-slate-800 rounded-lg p-0.5">
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                      <button
                        key={speed}
                        onClick={() => changePlaybackSpeed(speed)}
                        className={`px-2 py-1 text-xs rounded-md transition-all ${
                          playbackSpeed === speed
                            ? 'bg-emerald-500 text-white'
                            : 'text-slate-400 hover:text-white hover:bg-slate-700'
                        }`}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <audio
                ref={audioRef}
                controls
                className="w-full h-12 rounded-lg"
                preload="metadata"
                src={audioUrl}
                onTimeUpdate={(e) => setCurrentTime((e.target as HTMLAudioElement).currentTime)}
              >
                Your browser does not support the audio element.
              </audio>
            </div>
          )}

          {/* Tab Navigation */}
          <div className="flex gap-1 p-1 bg-slate-900/50 rounded-xl mb-4">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'overview'
                  ? 'bg-slate-700 text-white shadow-lg'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              Overview
            </button>
            <button
              onClick={() => setActiveTab('analysis')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'analysis'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-500/25'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              AI Analysis
              {analysis?.processing_status === 'done' && (
                <span className="w-2 h-2 bg-emerald-400 rounded-full" />
              )}
              {(analysisProgress.status === 'processing' || isAnalyzing) && (
                <span className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('edit')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'edit'
                  ? 'bg-slate-700 text-white shadow-lg'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
              </svg>
              Edit
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="mt-6">
          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Quick Actions */}
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-4">
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
                      Download
                    </a>
                  )}
                  
                  <button
                    onClick={() => router.push(`/dashboard/recordings/${recording.id}?delete=true`)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-red-600/80 text-slate-300 hover:text-white rounded-lg transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete
                  </button>
                </div>
              </div>

              {/* Bookmarks */}
              <BookmarkManager
                recordingId={recording.id}
                userId={user.id}
                currentTime={currentTime}
                onSeek={(seconds) => {
                  if (audioRef.current) {
                    audioRef.current.currentTime = seconds
                    audioRef.current.play()
                  }
                }}
              />

              {/* Comments */}
              <CommentsManager
                recordingId={recording.id}
                userId={user.id}
                currentTime={currentTime}
                onSeek={(seconds) => {
                  if (audioRef.current) {
                    audioRef.current.currentTime = seconds
                    audioRef.current.play()
                  }
                }}
              />
            </div>
          )}

          {/* ANALYSIS TAB */}
          {activeTab === 'analysis' && (
            <div className="space-y-6">
              {/* Analysis Actions */}
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Start Analysis - when no analysis exists or not pending */}
                  {(!analysis || analysis.processing_status === 'pending') && currentStatus === 'done' && !isAnalyzing && (
                    analysis?.processing_status === 'pending' ? (
                      <span className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg">
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        ⏳ In Queue
                      </span>
                    ) : (
                      <button
                        onClick={handleStartAnalysis}
                        disabled={isAnalyzing}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white font-medium rounded-xl shadow-lg shadow-purple-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                        🤖 Start AI Analysis
                      </button>
                    )
                  )}

                  {/* Retry Analysis - when error occurred */}
                  {(currentStatus === 'error' || analysisError || analysis?.processing_status === 'error') && !isAnalyzing && (
                    <button
                      onClick={handleStartAnalysis}
                      disabled={isAnalyzing}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white font-medium rounded-lg shadow-lg shadow-red-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      🔄 Retry Analysis
                    </button>
                  )}

                  {/* Re-analyze - when analysis exists and completed */}
                  {analysis && analysis.processing_status === 'done' && !isAnalyzing && (
                    <button
                      onClick={handleStartAnalysis}
                      disabled={isAnalyzing}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Run analysis again with fresh results"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Re-analyze
                    </button>
                  )}

                  {/* Analyzing in progress */}
                  {isAnalyzing && (
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg">
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Analyzing with AI...
                    </div>
                  )}

                  {/* Processing status indicator */}
                  {(currentStatus === 'processing' || analysisProgress.status === 'processing') && !isAnalyzing && (
                    <div className="inline-flex items-center gap-3 px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg">
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span>
                        {analysisProgress.totalChunks > 0 
                          ? `Chunk ${analysisProgress.completedChunks + 1}/${analysisProgress.totalChunks}`
                          : 'Starting...'}
                      </span>
                    </div>
                  )}

                  {analysisError && (
                    <p className="text-red-400 text-sm">{analysisError}</p>
                  )}
                </div>
              </div>

              {/* Analysis Content */}
              {analysis && analysis.processing_status === 'done' ? (
                <AnalysisDisplay analysis={analysis} onSeek={seekToTimestamp} />
              ) : analysisProgress.status === 'queued' ? (
                <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6">
                  <div className="text-center py-8">
                    <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center mb-4">
                      <span className="text-3xl">⏳</span>
                    </div>
                    <h3 className="text-lg font-medium text-white mb-2">Waiting in queue...</h3>
                    <p className="text-slate-400 text-sm">{analysisProgress.message || 'Will start automatically when server is free.'}</p>
                  </div>
                </div>
              ) : (currentStatus === 'processing' || analysisProgress.status === 'processing' || (analysis && analysis.processing_status === 'processing')) ? (
                <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6">
                  <div className="text-center py-8">
                    <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-purple-500/20 to-indigo-500/20 flex items-center justify-center mb-4">
                      <svg className="animate-spin w-8 h-8 text-purple-400" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-white mb-2">🤖 Analyzing...</h3>
                    <p className="text-slate-400 text-sm mb-4">{analysisProgress.message || 'Processing...'}</p>
                    {analysisProgress.totalChunks > 0 && (
                      <div className="max-w-xs mx-auto">
                        <div className="flex justify-between text-xs text-slate-400 mb-1">
                          <span>Progress</span>
                          <span>{analysisProgress.completedChunks}/{analysisProgress.totalChunks}</span>
                        </div>
                        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all"
                            style={{ width: `${(analysisProgress.completedChunks / analysisProgress.totalChunks) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : analysis?.processing_status === 'pending' ? (
                <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-blue-500/30 p-6">
                  <div className="text-center py-8">
                    <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center mb-4 animate-pulse">
                      <span className="text-3xl">⏳</span>
                    </div>
                    <h3 className="text-lg font-medium text-white mb-2">In Queue</h3>
                    <p className="text-slate-400 text-sm">Will start automatically when server is free.</p>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6">
                  <div className="text-center py-8">
                    <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-purple-500/10 to-indigo-500/10 flex items-center justify-center mb-4">
                      <svg className="w-8 h-8 text-purple-400/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-white mb-2">Ready for AI Analysis</h3>
                    <p className="text-slate-400 text-sm mb-4">Click the button above to unlock powerful insights</p>
                    <div className="flex flex-wrap justify-center gap-2 text-xs">
                      <span className="px-2 py-1 bg-slate-700/50 rounded">📝 Transcript</span>
                      <span className="px-2 py-1 bg-slate-700/50 rounded">⏱️ Timeline</span>
                      <span className="px-2 py-1 bg-slate-700/50 rounded">📖 Glossary</span>
                      <span className="px-2 py-1 bg-slate-700/50 rounded">💡 Insights</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* EDIT TAB */}
          {activeTab === 'edit' && (
            <div className="space-y-6">
              {audioUrl ? (
                <AudioEditor
                  audioUrl={audioUrl}
                  fileName={recording.file_name}
                  onSave={handleSaveEditedAudio}
                  onCancel={() => setActiveTab('overview')}
                />
              ) : (
                <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6">
                  <div className="text-center py-8">
                    <p className="text-slate-400">Loading audio...</p>
                  </div>
                </div>
              )}
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
