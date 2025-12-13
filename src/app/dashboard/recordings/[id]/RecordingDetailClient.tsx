'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { ConfirmModal } from '@/components/ui/Modal'
import { User } from '@supabase/supabase-js'
import { Recording, AudioAnalysis } from '@/types/database'

// Lazy load heavy components
const SalesScorecard = dynamic(() => import('@/components/sales/SalesScorecard'))
const CustomerInsights = dynamic(() => import('@/components/sales/CustomerInsights'))
const SpeakerAnalytics = dynamic(() => import('@/components/sales/SpeakerAnalytics'))
const ReEngagePanel = dynamic(() => import('@/components/sales/ReEngagePanel'))
const TranscriptPanel = dynamic(() => import('@/components/sales/TranscriptPanel'))
const SimpleAudioPlayer = dynamic(() => import('@/components/SimpleAudioPlayer'))
const ExportReportButton = dynamic(() => import('@/components/ExportReportButton'))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PartialAnalysis = any // Analysis without heavy transcript field (loaded lazily)

interface Props {
  recording: Recording
  analysis: PartialAnalysis | null
  user: User
}

type TabType = 'overview' | 'metrics' | 're-engage' | 'comments'

export default function RecordingDetailClient({ recording, analysis: initialAnalysis, user: _user }: Props) {
  const [analysis, setAnalysis] = useState<PartialAnalysis | null>(initialAnalysis)
  const [audioUrl, setAudioUrl] = useState<string>('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  
  // Lazy-loaded transcript (loaded separately to avoid memory issues)
  const [transcript, setTranscript] = useState<string | null>(null)
  const [transcriptLoading, setTranscriptLoading] = useState(false)
  
  // Delete modal
  const [deleteModal, setDeleteModal] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const audioRef = useRef<HTMLAudioElement>(null)
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
    // Load audio URL
    const loadUrl = async () => {
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
    loadUrl()
    
    // Realtime subscription for analysis updates
    if (supabase && recording.id) {
      const channel = supabase
        .channel(`analysis-${recording.id}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'audio_analyses',
          filter: `recording_id=eq.${recording.id}`,
        }, async (payload) => {
          const updated = payload.new as PartialAnalysis
          
          // When analysis completes, re-fetch (without heavy transcript field)
          if (updated.processing_status === 'done' || updated.processing_status === 'error') {
            const { data: freshAnalysis } = await supabase
              .from('audio_analyses')
              .select(`
                id, recording_id, processing_status, error_message, current_chunk_message,
                title, summary, scorecard, customer_analysis, speaker_analytics, re_engage,
                timeline, main_topics, duration_analyzed, language, confidence_score,
                input_tokens, output_tokens, total_tokens, model_used, estimated_cost_usd,
                created_at, updated_at
              `)
              .eq('recording_id', recording.id)
              .single()
            
            if (freshAnalysis) {
              setAnalysis(freshAnalysis)
              // Reset transcript so it will be reloaded
              setTranscript(null)
            }
            setIsAnalyzing(false)
          } else {
            // For progress updates, just use the payload
            setAnalysis(updated)
          }
        })
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }
  }, [recording.id, recording.file_path, supabase])

  // Load transcript on demand (it's heavy, so we load it separately)
  const loadTranscript = async () => {
    if (transcript || transcriptLoading || !supabase || !analysis?.id) return
    
    setTranscriptLoading(true)
    try {
      const { data } = await supabase
        .from('audio_analyses')
        .select('transcript')
        .eq('id', analysis.id)
        .single()
      
      if (data?.transcript) {
        setTranscript(data.transcript)
      }
    } catch (err) {
      console.error('Failed to load transcript:', err)
    } finally {
      setTranscriptLoading(false)
    }
  }

  const handleStartAnalysis = async () => {
    if (!supabase) return
    
    setIsAnalyzing(true)
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordingId: recording.id,
          filePath: recording.file_path,
        }),
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.message || 'Failed to start analysis')
      }
      
      toast.info(`Analysis started! Mode: ${result.mode}, Est. ${result.estimatedMinutes} min`)
    } catch (err) {
      setIsAnalyzing(false)
      toast.error(err instanceof Error ? err.message : 'Failed to start analysis')
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
    } catch {
      toast.error('Failed to delete recording')
    } finally {
      setIsDeleting(false)
    }
  }

  const seekToTimestamp = (timestamp: string) => {
    const parts = timestamp.split(':').map(Number)
    let seconds = 0
    if (parts.length === 3) {
      seconds = parts[0] * 3600 + parts[1] * 60 + parts[2]
    } else if (parts.length === 2) {
      seconds = parts[0] * 60 + parts[1]
    }
    
    if (audioRef.current) {
      audioRef.current.currentTime = seconds
      audioRef.current.play()
    }
  }

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return '--:--'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`
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

  // Extract customer/rep names from analysis
  const customerName = 'Customer'
  const repName = 'Rep'

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { 
      id: 'overview', 
      label: 'Overview', 
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
    },
    { 
      id: 'metrics', 
      label: 'Metrics', 
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
    },
    { 
      id: 're-engage', 
      label: 'Re-Engage', 
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
    },
    { 
      id: 'comments', 
      label: 'Comments', 
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
    },
  ]

  if (isLoading) {
    return (
      <div className="h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="h-screen bg-slate-900 flex overflow-hidden">
      {/* Sidebar Navigation - Fixed height */}
      <aside className={`${sidebarCollapsed ? 'w-16' : 'w-52'} flex-shrink-0 bg-slate-950 border-r border-slate-800 flex flex-col h-full transition-all duration-300`}>
        {/* Back button */}
        <div className="p-4 border-b border-slate-800">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {!sidebarCollapsed && <span>Back</span>}
          </Link>
        </div>

        {/* Navigation tabs */}
        <nav className="flex-1 p-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg mb-1 transition-colors ${
                activeTab === tab.id
                  ? 'bg-amber-500/10 text-amber-400'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              {tab.icon}
              {!sidebarCollapsed && <span className="font-medium">{tab.label}</span>}
            </button>
          ))}
        </nav>

        {/* Bottom actions */}
        <div className="p-2 border-t border-slate-800 space-y-1">
          <button className="w-full flex items-center gap-3 px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-lg transition-colors">
            <span>«</span>
            {!sidebarCollapsed && <span className="text-sm">Previous Recording</span>}
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-lg transition-colors">
            <span>»</span>
            {!sidebarCollapsed && <span className="text-sm">Next Recording</span>}
          </button>
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full flex items-center gap-3 px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-lg transition-colors"
          >
            <span>{sidebarCollapsed ? '→' : '←'}</span>
            {!sidebarCollapsed && <span className="text-sm">Collapse Menu</span>}
          </button>
        </div>
      </aside>

      {/* Main Content - Takes remaining width, full height */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Header */}
        <header className="flex-shrink-0 bg-slate-900 border-b border-slate-800 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-white">{recording.file_name}</h1>
              <div className="flex items-center gap-4 mt-1 text-sm text-slate-400">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  analysis?.processing_status === 'done' 
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : analysis?.processing_status === 'processing'
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'bg-slate-500/20 text-slate-400'
                }`}>
                  {analysis?.processing_status === 'done' ? '✓ Done' : 
                   analysis?.processing_status === 'processing' ? '⏳ Processing' : 
                   '📋 IN PROGRESS'}
                </span>
                <span>{formatDate(recording.created_at)}</span>
                <span>⏱ {formatDuration(recording.duration)}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Start Analysis button - show if no analysis, error, or missing new fields */}
              {(!analysis || analysis.processing_status === 'error' || (analysis.processing_status === 'done' && !analysis.scorecard)) && !isAnalyzing && (
                <button
                  onClick={handleStartAnalysis}
                  className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium rounded-lg hover:from-amber-600 hover:to-orange-600 transition-all flex items-center gap-2"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  <span>{analysis?.processing_status === 'done' ? 'Re-Analyze' : 'Analyze'}</span>
                </button>
              )}
              
              {isAnalyzing && (
                <span className="px-4 py-2 bg-amber-500/20 text-amber-400 rounded-lg flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Analyzing...
                </span>
              )}

              {/* Export Report Button */}
              {analysis?.comprehensive_report && (
                <ExportReportButton 
                  report={analysis.comprehensive_report}
                  fileName={`${recording.file_name.replace(/\.[^/.]+$/, '')}_report`}
                />
              )}

              <button className="p-2 text-slate-400 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
              <button 
                onClick={() => setDeleteModal(true)}
                className="p-2 text-slate-400 hover:text-red-400 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-6">
          {/* Tab Content */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Scorecard Summary */}
              {analysis?.scorecard && (
                <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="text-4xl font-bold text-amber-400">{analysis.scorecard.total || 0}</div>
                      <div className="text-xs text-slate-500">of 100</div>
                    </div>
                    <div className="flex-1 grid grid-cols-3 gap-4">
                      <div>
                        <div className="text-xs text-slate-500 mb-1">Process</div>
                        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500" style={{ width: `${analysis.scorecard.process?.score || 0}%` }} />
                        </div>
                        <div className="text-xs text-slate-400 mt-1">{analysis.scorecard.process?.score || 0}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 mb-1">Skills</div>
                        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500" style={{ width: `${analysis.scorecard.skills?.score || 0}%` }} />
                        </div>
                        <div className="text-xs text-slate-400 mt-1">{analysis.scorecard.skills?.score || 0}</div>
                      </div>
                      {analysis.scorecard.communication && (
                      <div>
                        <div className="text-xs text-slate-500 mb-1">Communication</div>
                        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                          <div className="h-full bg-purple-500" style={{ width: `${analysis.scorecard.communication.score}%` }} />
                        </div>
                        <div className="text-xs text-slate-400 mt-1">{analysis.scorecard.communication.score}</div>
                      </div>
                      )}
                    </div>
                    <Link
                      href="#"
                      onClick={(e) => { e.preventDefault(); setActiveTab('metrics'); }}
                      className="text-amber-400 hover:text-amber-300 text-sm"
                    >
                      View details →
                    </Link>
                  </div>
                </div>
              )}

              {/* Customer Insights */}
              <CustomerInsights 
                analysis={analysis?.customer_analysis || null}
                onTimestampClick={seekToTimestamp}
                onStartAnalysis={handleStartAnalysis}
                isAnalyzing={isAnalyzing || analysis?.processing_status === 'processing'}
              />

            </div>
          )}

          {activeTab === 'metrics' && (
            <div className="space-y-6">
              <SalesScorecard 
                scorecard={analysis?.scorecard || null}
                onTimestampClick={seekToTimestamp}
              />
              <SpeakerAnalytics analytics={analysis?.speaker_analytics || null} />
            </div>
          )}

          {activeTab === 're-engage' && (
            <ReEngagePanel 
              reEngage={analysis?.re_engage || null}
              customerName={customerName}
              repName={repName}
            />
          )}

          {activeTab === 'comments' && (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
              <div className="text-center py-12 text-slate-500">
                No comments found for this recording.
              </div>
            </div>
          )}
        </main>

        {/* Audio Player - Fixed at bottom */}
        <div className="flex-shrink-0 border-t border-slate-800 bg-slate-950 p-4">
          {audioUrl && recording.duration ? (
            <SimpleAudioPlayer
              src={audioUrl}
              duration={recording.duration}
              onTimeUpdate={setCurrentTime}
              playbackSpeed={playbackSpeed}
              onPlaybackSpeedChange={setPlaybackSpeed}
            />
          ) : (
            <div className="h-16 flex items-center justify-center text-slate-500">
              Loading audio player...
            </div>
          )}
        </div>
      </div>

      {/* Right Sidebar - Transcript - Full height like left sidebar */}
      <aside 
        className="w-96 flex-shrink-0 bg-slate-900 border-l border-slate-800 flex flex-col h-full"
        onMouseEnter={loadTranscript}
      >
        {transcriptLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto mb-3"></div>
              <p className="text-slate-400 text-sm">Loading transcript...</p>
            </div>
          </div>
        ) : (
          <TranscriptPanel
            transcript={transcript}
            currentTime={currentTime}
            onTimestampClick={seekToTimestamp}
          />
        )}
      </aside>

      {/* Delete Modal */}
      <ConfirmModal
        isOpen={deleteModal}
        onClose={() => setDeleteModal(false)}
        onConfirm={handleDelete}
        title="Delete Recording"
        message={`Are you sure you want to delete "${recording.file_name}"? This cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        loading={isDeleting}
      />
    </div>
  )
}
