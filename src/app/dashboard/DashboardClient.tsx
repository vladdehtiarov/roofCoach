'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import AudioUploader from '@/components/AudioUploader'
import AudioRecorder from '@/components/AudioRecorder'
import { useToast } from '@/components/ui/Toast'
import { ConfirmModal } from '@/components/ui/Modal'
import { RecordingListSkeleton } from '@/components/ui/Skeleton'
import { User } from '@supabase/supabase-js'
import { Recording, RecordingWithTranscript } from '@/types/database'

interface RecordingWithUrl extends RecordingWithTranscript {
  audioUrl?: string
}

type FilterType = 'active' | 'archived' | 'all'
type AnalysisFilter = 'all' | 'analyzed' | 'not_analyzed'
type SortType = 'newest' | 'oldest' | 'name' | 'size' | 'duration' | 'analyzed_first'
type InputMode = 'upload' | 'record'

const ITEMS_PER_PAGE = 10

export default function DashboardClient({ user }: { user: User }) {
  const [recordings, setRecordings] = useState<RecordingWithUrl[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterType>('active')
  const [analysisFilter, setAnalysisFilter] = useState<AnalysisFilter>('all')
  const [sortBy, setSortBy] = useState<SortType>('newest')
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [isAdmin, setIsAdmin] = useState(false)
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null)
  const [inputMode, setInputMode] = useState<InputMode>('record')
  
  // Delete modal state
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; recording: RecordingWithUrl | null }>({
    isOpen: false,
    recording: null,
  })
  const [isDeleting, setIsDeleting] = useState(false)
  
  // Rename state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [isSavingName, setIsSavingName] = useState(false)

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
    loadRecordings()
    checkAdminStatus()
  }, [supabase, filter])

  // Reset page when filter or search changes
  useEffect(() => {
    setCurrentPage(1)
  }, [filter, analysisFilter, searchQuery, sortBy])

  const checkAdminStatus = async () => {
    if (!supabase) return
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    setIsAdmin(data?.role === 'admin')
  }

  const getSignedUrl = async (filePath: string): Promise<string> => {
    if (!supabase) return ''
    
    const { data, error } = await supabase.storage
      .from('audio-files')
      .createSignedUrl(filePath, 3600)
    
    if (error) {
      console.error('Error creating signed URL:', error)
      return ''
    }
    
    return data.signedUrl
  }

  const loadRecordings = async () => {
    if (!supabase) {
      setLoading(false)
      return
    }
    
    setLoading(true)
    try {
      let query = supabase
        .from('recordings_with_status')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (filter === 'active') {
        query = query.eq('is_archived', false)
      } else if (filter === 'archived') {
        query = query.eq('is_archived', true)
      }

      const { data, error } = await query

      if (error) throw error

      const recordingsWithUrls = await Promise.all(
        (data || []).map(async (recording) => {
          const audioUrl = await getSignedUrl(recording.file_path)
          return { ...recording, audioUrl }
        })
      )

      setRecordings(recordingsWithUrls)
    } catch (err) {
      console.error('Error loading recordings:', err)
      toast.error('Failed to load recordings')
    } finally {
      setLoading(false)
    }
  }

  // Filter, sort and paginate recordings
  const processedRecordings = useMemo(() => {
    let result = [...recordings]

    // Analysis filter
    if (analysisFilter === 'analyzed') {
      result = result.filter(r => r.has_analysis)
    } else if (analysisFilter === 'not_analyzed') {
      result = result.filter(r => !r.has_analysis)
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(r => 
        r.file_name.toLowerCase().includes(query) ||
        r.transcript_text?.toLowerCase().includes(query) ||
        r.analysis_title?.toLowerCase().includes(query)
      )
    }

    // Sort
    switch (sortBy) {
      case 'newest':
        result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        break
      case 'oldest':
        result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        break
      case 'name':
        result.sort((a, b) => a.file_name.localeCompare(b.file_name))
        break
      case 'size':
        result.sort((a, b) => b.file_size - a.file_size)
        break
      case 'duration':
        result.sort((a, b) => (b.duration || 0) - (a.duration || 0))
        break
      case 'analyzed_first':
        result.sort((a, b) => {
          if (a.has_analysis === b.has_analysis) {
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          }
          return a.has_analysis ? -1 : 1
        })
        break
    }

    return result
  }, [recordings, analysisFilter, searchQuery, sortBy])

  // Pagination
  const totalPages = Math.ceil(processedRecordings.length / ITEMS_PER_PAGE)
  const paginatedRecordings = processedRecordings.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  const handleSignOut = async () => {
    if (supabase) {
      await supabase.auth.signOut()
    }
    router.push('/login')
    router.refresh()
  }

  const handleUploadComplete = async (recording: Recording) => {
    const audioUrl = await getSignedUrl(recording.file_path)
    
    const recordingWithUrl: RecordingWithUrl = {
      ...recording,
      has_transcript: false,
      transcript_text: null,
      has_analysis: false,
      analysis_title: null,
      audioUrl,
    }
    setRecordings((prev) => [recordingWithUrl, ...prev])
    toast.success('Audio uploaded successfully!')
  }

  const openDeleteModal = (recording: RecordingWithUrl) => {
    setDeleteModal({ isOpen: true, recording })
  }

  const closeDeleteModal = () => {
    setDeleteModal({ isOpen: false, recording: null })
  }

  const handleDeleteRecording = async () => {
    if (!supabase || !deleteModal.recording) return
    
    setIsDeleting(true)
    try {
      const { error: storageError } = await supabase.storage
        .from('audio-files')
        .remove([deleteModal.recording.file_path])

      if (storageError) {
        console.error('Storage delete error:', storageError)
      }

      const { error: dbError } = await supabase
        .from('recordings')
        .delete()
        .eq('id', deleteModal.recording.id)

      if (dbError) throw dbError

      setRecordings((prev) => prev.filter((r) => r.id !== deleteModal.recording!.id))
      toast.success('Recording deleted successfully')
      closeDeleteModal()
    } catch (err) {
      console.error('Error deleting recording:', err)
      toast.error('Failed to delete recording')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleArchiveRecording = async (recording: RecordingWithUrl, archive: boolean) => {
    if (!supabase) return

    try {
      const { error } = await supabase
        .from('recordings')
        .update({ is_archived: archive })
        .eq('id', recording.id)

      if (error) throw error

      if ((filter === 'active' && archive) || (filter === 'archived' && !archive)) {
        setRecordings((prev) => prev.filter((r) => r.id !== recording.id))
      } else {
        setRecordings((prev) =>
          prev.map((r) => (r.id === recording.id ? { ...r, is_archived: archive } : r))
        )
      }
      toast.success(archive ? 'Recording archived' : 'Recording restored')
    } catch (err) {
      console.error('Error archiving recording:', err)
      toast.error('Failed to update recording')
    }
  }

  const startRename = (recording: RecordingWithUrl) => {
    setEditingId(recording.id)
    setEditingName(recording.file_name)
  }

  const cancelRename = () => {
    setEditingId(null)
    setEditingName('')
  }

  const handleRename = async (recordingId: string) => {
    if (!supabase || !editingName.trim()) {
      cancelRename()
      return
    }

    const recording = recordings.find(r => r.id === recordingId)
    if (!recording || editingName.trim() === recording.file_name) {
      cancelRename()
      return
    }

    setIsSavingName(true)
    try {
      const { error } = await supabase
        .from('recordings')
        .update({ file_name: editingName.trim() })
        .eq('id', recordingId)

      if (error) throw error

      setRecordings((prev) =>
        prev.map((r) => (r.id === recordingId ? { ...r, file_name: editingName.trim() } : r))
      )
      toast.success('Recording renamed')
      cancelRename()
    } catch (err) {
      console.error('Error renaming recording:', err)
      toast.error('Failed to rename recording')
    } finally {
      setIsSavingName(false)
    }
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent, recordingId: string) => {
    if (e.key === 'Enter') {
      handleRename(recordingId)
    } else if (e.key === 'Escape') {
      cancelRename()
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
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return '--:--'
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`
  }

  const getStatusBadge = (status: string, isArchived?: boolean) => {
    if (isArchived) {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-500/20 text-slate-400">
          Archived
        </span>
      )
    }
    const statusConfig = {
      uploading: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Uploading' },
      processing: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'Processing' },
      done: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: 'Done' },
      error: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Error' },
    }
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.error
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMyMDIwMjAiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRjMC0yIDItNCAyLTRzLTItMi00LTItNCAwLTQgMiAwIDIgMiA0IDQgMiA0IDIgMC0yIDAtMnoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-20 pointer-events-none"></div>

      {/* Header */}
      <header className="relative border-b border-slate-700/50 bg-slate-900/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/">
              <Image
                src="/Logo.svg"
                alt="RoofCoach"
                width={140}
                height={40}
                className="h-10 w-auto"
              />
            </Link>

            <div className="flex items-center gap-4">
              {isAdmin && (
                <Link
                  href="/admin"
                  className="px-4 py-2 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Admin
                </Link>
              )}
              <span className="text-slate-400 text-sm hidden sm:block">{user.email}</span>
              <button
                onClick={handleSignOut}
                className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Welcome back!</h1>
          <p className="text-slate-400 mt-1">
            Record your calls and meetings to improve your coaching
          </p>
        </div>

        {/* Record/Upload Section - Recording is Primary */}
        <div className="mb-12">
          <div className="bg-gradient-to-br from-slate-800/70 to-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 overflow-hidden">
            {/* Header with emphasis on recording */}
            <div className="bg-gradient-to-r from-red-500/10 via-slate-800/50 to-amber-500/10 border-b border-slate-700/50 px-6 py-4">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500/30 to-rose-500/30 flex items-center justify-center">
                    <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white">Capture Audio</h2>
                    <p className="text-slate-400 text-sm">Record calls, meetings, or upload existing files</p>
                  </div>
                </div>

                {/* Tabs - Record first, more prominent */}
                <div className="flex items-center bg-slate-900/50 rounded-xl p-1 border border-slate-700/50">
                  <button
                    onClick={() => setInputMode('record')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      inputMode === 'record'
                        ? 'bg-gradient-to-r from-red-500 to-rose-500 text-white shadow-lg shadow-red-500/25'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                    </svg>
                    Record
                    {inputMode === 'record' && (
                      <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                    )}
                  </button>
                  <button
                    onClick={() => setInputMode('upload')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      inputMode === 'upload'
                        ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/25'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    Upload
                  </button>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              {inputMode === 'record' ? (
                <AudioRecorder onRecordingComplete={handleUploadComplete} />
              ) : (
                <AudioUploader onUploadComplete={handleUploadComplete} />
              )}
            </div>
          </div>
        </div>

        {/* Recordings Section */}
        <div>
          {/* Header with filters */}
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="text-xl font-semibold text-white">Your Recordings</h2>
              <button
                onClick={loadRecordings}
                className="p-2 text-slate-400 hover:text-white transition-colors self-end sm:self-auto"
                title="Refresh"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
            
            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Status Filter */}
              <div className="flex items-center gap-1 p-1 bg-slate-800/50 rounded-lg">
                {(['active', 'archived', 'all'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                      filter === f
                        ? 'bg-slate-700 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>

              {/* Divider */}
              <div className="h-6 w-px bg-slate-700 hidden sm:block" />
              
              {/* Analysis Filter */}
              <div className="flex items-center gap-1 p-1 bg-slate-800/50 rounded-lg">
                <button
                  onClick={() => setAnalysisFilter('all')}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    analysisFilter === 'all'
                      ? 'bg-slate-700 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setAnalysisFilter('analyzed')}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors flex items-center gap-1.5 ${
                    analysisFilter === 'analyzed'
                      ? 'bg-emerald-500/20 text-emerald-400 shadow'
                      : 'text-slate-400 hover:text-emerald-400'
                  }`}
                >
                  <span>✨</span>
                  Analyzed
                </button>
                <button
                  onClick={() => setAnalysisFilter('not_analyzed')}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    analysisFilter === 'not_analyzed'
                      ? 'bg-amber-500/20 text-amber-400 shadow'
                      : 'text-slate-400 hover:text-amber-400'
                  }`}
                >
                  Not analyzed
                </button>
              </div>

              {/* Active filters indicator */}
              {(filter !== 'active' || analysisFilter !== 'all') && (
                <button
                  onClick={() => { setFilter('active'); setAnalysisFilter('all'); }}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-white transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {/* Search and Sort */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            {/* Search */}
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search recordings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Sort */}
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-sm">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortType)}
                className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="name">Name A-Z</option>
                <option value="size">Largest first</option>
                <option value="duration">Longest first</option>
                <option value="analyzed_first">✨ Analyzed first</option>
              </select>
            </div>
          </div>

          {/* Results count */}
          {(searchQuery || analysisFilter !== 'all') && (
            <p className="text-slate-400 text-sm mb-4">
              Found {processedRecordings.length} recording{processedRecordings.length !== 1 ? 's' : ''}
              {searchQuery && ` matching "${searchQuery}"`}
              {analysisFilter === 'analyzed' && ' (analyzed)'}
              {analysisFilter === 'not_analyzed' && ' (not analyzed)'}
            </p>
          )}

          {/* Recordings List */}
          {loading ? (
            <RecordingListSkeleton count={5} />
          ) : paginatedRecordings.length === 0 ? (
            <div className="bg-slate-800/30 rounded-2xl border border-slate-700/30 p-12 text-center">
              <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-slate-700/50 to-slate-800/50 flex items-center justify-center mb-6">
                {searchQuery ? (
                  <svg className="w-10 h-10 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                ) : (
                  <svg className="w-10 h-10 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                )}
              </div>
              <h3 className="text-lg font-medium text-white mb-2">
                {searchQuery ? 'No matching recordings' : filter === 'archived' ? 'No archived recordings' : 'No recordings yet'}
              </h3>
              <p className="text-slate-500 text-sm max-w-sm mx-auto">
                {searchQuery 
                  ? 'Try adjusting your search terms or filters'
                  : filter === 'archived' 
                    ? 'Archived recordings will appear here' 
                    : 'Upload your first audio file to get started. We support files up to 3 hours long.'}
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-3">
                {paginatedRecordings.map((recording) => (
                  <div
                    key={recording.id}
                    className={`bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 hover:border-amber-500/30 hover:bg-slate-800/70 transition-all ${
                      recording.is_archived ? 'opacity-60' : ''
                    }`}
                  >
                    <div className="p-4">
                      <div className="flex items-center gap-4">
                        <div 
                          className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center cursor-pointer hover:from-amber-500/30 hover:to-orange-500/30 transition-colors"
                          onClick={() => setExpandedPlayer(expandedPlayer === recording.id ? null : recording.id)}
                          title={expandedPlayer === recording.id ? 'Hide player' : 'Show player'}
                        >
                          {expandedPlayer === recording.id ? (
                            <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          ) : (
                            <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {editingId === recording.id ? (
                              <input
                                type="text"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                onKeyDown={(e) => handleRenameKeyDown(e, recording.id)}
                                onBlur={() => handleRename(recording.id)}
                                autoFocus
                                className="max-w-[200px] px-2 py-1 text-white font-medium bg-slate-700/50 border border-amber-500/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                                disabled={isSavingName}
                              />
                            ) : (
                              <Link href={`/dashboard/recordings/${recording.id}`} className="truncate max-w-[50%]">
                                <h3 className="text-white font-medium truncate hover:text-amber-400 transition-colors">{recording.file_name}</h3>
                              </Link>
                            )}
                            {editingId !== recording.id && (
                              <button
                                onClick={(e) => { e.stopPropagation(); startRename(recording); }}
                                className="p-1 text-slate-500 hover:text-amber-400 transition-all rounded hover:bg-slate-700/50 flex-shrink-0"
                                title="Rename"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                              </button>
                            )}
                            {isSavingName && editingId === recording.id && (
                              <svg className="animate-spin w-4 h-4 text-amber-400 flex-shrink-0" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                            )}
                            {getStatusBadge(recording.status, recording.is_archived)}
                            {recording.has_analysis && (
                              <span className="px-2 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400">
                                ✨ Analyzed
                              </span>
                            )}
                            {recording.has_transcript && !recording.has_analysis && (
                              <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400">
                                Transcribed
                              </span>
                            )}
                          </div>
                          <Link href={`/dashboard/recordings/${recording.id}`}>
                            <p className="text-slate-400 text-sm hover:text-slate-300 transition-colors">
                              {formatFileSize(recording.file_size)} 
                              {recording.duration && ` • ${formatDuration(recording.duration)}`}
                              {' • '}{formatDate(recording.created_at)}
                            </p>
                          </Link>
                        </div>
                        <div className="flex items-center gap-1">
                          {recording.audioUrl && (
                            <a
                              href={recording.audioUrl}
                              download={recording.file_name}
                              onClick={(e) => e.stopPropagation()}
                              className="p-2 text-slate-400 hover:text-white transition-colors"
                              title="Download"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                            </a>
                          )}
                          <button
                            onClick={() => handleArchiveRecording(recording, !recording.is_archived)}
                            className={`p-2 transition-colors ${
                              recording.is_archived
                                ? 'text-emerald-400 hover:text-emerald-300'
                                : 'text-slate-400 hover:text-amber-400'
                            }`}
                            title={recording.is_archived ? 'Restore' : 'Archive'}
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                            </svg>
                          </button>
                          <button
                            onClick={() => openDeleteModal(recording)}
                            className="p-2 text-slate-400 hover:text-red-400 transition-colors"
                            title="Delete"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                          <Link
                            href={`/dashboard/recordings/${recording.id}`}
                            className="p-2 text-slate-500 hover:text-amber-400 transition-colors"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </Link>
                        </div>
                      </div>
                    </div>
                    
                    {/* Expandable Audio Player */}
                    {expandedPlayer === recording.id && recording.audioUrl && recording.status === 'done' && !recording.is_archived && (
                      <div className="px-4 pb-4 animate-fade-in">
                        <audio
                          controls
                          className="w-full h-12 rounded-lg"
                          preload="metadata"
                          src={recording.audioUrl}
                        >
                          Your browser does not support the audio element.
                        </audio>
                      </div>
                    )}

                    {/* Transcript Preview */}
                    {recording.has_transcript && recording.transcript_text && (
                      <div className="mx-4 mb-4 p-4 bg-slate-900/50 rounded-lg border border-slate-700/30">
                        <div className="flex items-center gap-2 mb-2">
                          <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span className="text-sm font-medium text-purple-400">Transcript Preview</span>
                        </div>
                        <p className="text-slate-300 text-sm line-clamp-2">
                          {recording.transcript_text}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${
                          currentPage === page
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                      >
                        {page}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={closeDeleteModal}
        onConfirm={handleDeleteRecording}
        title="Delete Recording"
        message={`Are you sure you want to delete "${deleteModal.recording?.file_name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        loading={isDeleting}
      />
    </div>
  )
}
