'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { ConfirmModal } from '@/components/ui/Modal'
import { User } from '@supabase/supabase-js'
import { Recording, AudioAnalysis, W4Report, W4_PHASE_CONFIG } from '@/types/database'

// Lazy load heavy components
const W4OverallPerformance = dynamic(() => import('@/components/w4/W4OverallPerformance').then(m => ({ default: m.W4OverallPerformance })))
const W4PhaseCard = dynamic(() => import('@/components/w4/W4PhaseCard').then(m => ({ default: m.W4PhaseCard })))
const W4TotalScores = dynamic(() => import('@/components/w4/W4TotalScores').then(m => ({ default: m.W4TotalScores })))
const W4Insights = dynamic(() => import('@/components/w4/W4Insights').then(m => ({ default: m.W4Insights })))
const W4Coaching = dynamic(() => import('@/components/w4/W4Coaching').then(m => ({ default: m.W4Coaching })))
const W4QuickWins = dynamic(() => import('@/components/w4/W4QuickWins').then(m => ({ default: m.W4QuickWins })))
const W4ExportButton = dynamic(() => import('@/components/w4/W4ExportButton').then(m => ({ default: m.W4ExportButton })))
const ProcessingStages = dynamic(() => import('@/components/w4/ProcessingStages').then(m => ({ default: m.ProcessingStages })))
const TranscriptPanel = dynamic(() => import('@/components/sales/TranscriptPanel'))
const SimpleAudioPlayer = dynamic(() => import('@/components/SimpleAudioPlayer'))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PartialAnalysis = any // Analysis without heavy transcript field (loaded lazily)

interface Props {
  recording: Recording
  analysis: PartialAnalysis | null
  user: User
}

export default function RecordingDetailClient({ recording, analysis: initialAnalysis, user: _user }: Props) {
  const [analysis, setAnalysis] = useState<PartialAnalysis | null>(initialAnalysis)
  const [audioUrl, setAudioUrl] = useState<string>('')
  const [currentTime, setCurrentTime] = useState(0)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  
  // isAnalyzing is ONLY true when W4 analysis is actively running
  // Transcript generation is separate and shown on the right panel
  const processingStage = analysis?.processing_stage as 'pending' | 'transcribing' | 'analyzing' | 'done' | 'error' | undefined
  const w4Report: W4Report | null = analysis?.w4_report || null
  const isAnalyzing = processingStage === 'analyzing' && !w4Report // ONLY W4 analysis, not transcript
  
  // Lazy-loaded transcript (loaded separately to avoid memory issues)
  const [transcript, setTranscript] = useState<string | null>(null)
  const [transcriptLoading, setTranscriptLoading] = useState(false)
  // Initialize transcriptGenerating based on processing_stage (persists across navigation)
  const [transcriptGenerating, setTranscriptGenerating] = useState(processingStage === 'transcribing')
  const [transcriptProgress, setTranscriptProgress] = useState<string | null>(
    processingStage === 'transcribing' ? analysis?.current_chunk_message || 'Transcribing...' : null
  )
  const transcriptGeneratingRef = useRef(processingStage === 'transcribing')
  
  // Keep ref and state in sync with processing_stage changes
  useEffect(() => {
    transcriptGeneratingRef.current = transcriptGenerating
  }, [transcriptGenerating])
  
  // Sync transcriptGenerating with processingStage from DB
  useEffect(() => {
    const isTranscribing = processingStage === 'transcribing'
    if (isTranscribing) {
      setTranscriptGenerating(true)
      setTranscriptProgress(analysis?.current_chunk_message || 'Transcribing...')
      transcriptGeneratingRef.current = true
    } else if (transcriptGeneratingRef.current) {
      // Transcription finished
      setTranscriptGenerating(false)
      setTranscriptProgress(null)
      transcriptGeneratingRef.current = false
    }
  }, [processingStage, analysis?.current_chunk_message])
  
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
      const handleAnalysisChange = async (payload: { new: PartialAnalysis }) => {
        const updated = payload.new as PartialAnalysis
        
        // Update transcript progress if we're generating transcript (use ref to avoid stale closure)
        if (updated.current_chunk_message && transcriptGeneratingRef.current) {
          setTranscriptProgress(updated.current_chunk_message)
        }
        
        // When analysis completes or errors, re-fetch full data
        if (updated.processing_status === 'done' || updated.processing_status === 'error' || 
            updated.processing_stage === 'done' || updated.processing_stage === 'error') {
          const { data: freshAnalysis } = await supabase
            .from('audio_analyses')
            .select(`
              id, recording_id, processing_status, processing_stage, error_message, current_chunk_message,
              title, summary, w4_report,
              duration_analyzed, language, confidence_score,
              input_tokens, output_tokens, total_tokens, model_used, estimated_cost_usd,
              created_at, updated_at
            `)
            .eq('recording_id', recording.id)
            .single()
          
          if (freshAnalysis) {
            setAnalysis(freshAnalysis)
            // Transcript done - stop generating and load it (use ref)
            if (transcriptGeneratingRef.current) {
              setTranscriptGenerating(false)
              setTranscriptProgress(null)
              // Load the transcript
              const { data: transcriptData } = await supabase
                .from('audio_analyses')
                .select('transcript')
                .eq('id', freshAnalysis.id)
                .single()
              if (transcriptData?.transcript) {
                setTranscript(transcriptData.transcript)
              }
            } else {
              setTranscript(null)
            }
          }
        } else {
          // For progress updates, MERGE with existing analysis (keep w4_report etc.)
          setAnalysis((prev: PartialAnalysis | null) => prev ? { ...prev, ...updated } : updated)
        }
      }

      const channel = supabase
        .channel(`analysis-${recording.id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'audio_analyses',
          filter: `recording_id=eq.${recording.id}`,
        }, handleAnalysisChange)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'audio_analyses',
          filter: `recording_id=eq.${recording.id}`,
        }, handleAnalysisChange)
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
    
    // Optimistically update UI - start with analyzing stage (no transcription step)
    setAnalysis((prev: PartialAnalysis | null) => prev ? { 
      ...prev, 
      processing_status: 'processing', 
      processing_stage: 'analyzing',
      current_chunk_message: 'Starting W4 analysis...' 
    } : { 
      processing_status: 'processing', 
      processing_stage: 'analyzing',
      current_chunk_message: 'Starting W4 analysis...' 
    })
    
    try {
      // Call analyze endpoint directly (W4 analysis only, no transcript)
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordingId: recording.id,
          filePath: recording.analysis_file_path || recording.file_path,
        }),
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.message || 'Failed to start analysis')
      }
      
      toast.info('🤖 W4 Analysis started! This will take 2-5 minutes.')
    } catch (err) {
      // Reset on error
      setAnalysis((prev: PartialAnalysis | null) => prev ? { ...prev, processing_status: 'error', processing_stage: 'error' } : null)
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

  // Generate transcript on-demand (streaming)
  const handleGenerateTranscript = async () => {
    if (!supabase || transcriptGenerating) return
    
    setTranscriptGenerating(true)
    setTranscriptProgress('Starting transcript generation...')
    
    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordingId: recording.id,
          filePath: recording.analysis_file_path || recording.file_path,
          transcriptOnly: true, // Flag to skip W4 analysis
        }),
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.message || 'Failed to generate transcript')
      }
      
      toast.info('🎙️ Transcript generation started! This may take a few minutes.')
      
      // Poll for transcript updates (streaming progress shown via realtime)
      // The transcript will be loaded automatically when done via realtime subscription
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate transcript')
      setTranscriptGenerating(false)
      setTranscriptProgress(null)
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

  // Phase colors
  const phaseColors = {
    why: '#3b82f6',   // Blue
    what: '#8b5cf6',  // Purple
    who: '#f97316',   // Orange
    when: '#22c55e',  // Green
  }

  if (isLoading) {
    return (
      <div className="h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="h-screen bg-gray-950 flex overflow-hidden">
      {/* Sidebar Navigation - Fixed height */}
      <aside className={`${sidebarCollapsed ? 'w-16' : 'w-52'} flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col h-full transition-all duration-300`}>
        {/* Back button */}
        <div className="p-4 border-b border-gray-800">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {!sidebarCollapsed && <span>Back</span>}
          </Link>
        </div>

        {/* Recording Info */}
        {!sidebarCollapsed && (
          <div className="p-4 border-b border-gray-800">
            <h2 className="text-sm font-medium text-white truncate mb-1">{recording.file_name}</h2>
            <p className="text-xs text-gray-500">{formatDate(recording.created_at)}</p>
            <p className="text-xs text-gray-500">Duration: {formatDuration(recording.duration)}</p>
          </div>
        )}

        {/* W4 Report Quick Nav */}
        {!sidebarCollapsed && w4Report && (
          <nav className="flex-1 p-2 overflow-y-auto">
            <p className="text-xs text-gray-500 px-3 py-2">PHASES</p>
            {(['why', 'what', 'who', 'when'] as const).map((phase) => (
              <a
                key={phase}
                href={`#phase-${phase}`}
                className="flex items-center justify-between px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div 
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: phaseColors[phase] }}
                  />
                  <span className="text-sm">{W4_PHASE_CONFIG[phase].name}</span>
                </div>
                <span className="text-xs text-gray-500">
                  {w4Report.phases[phase].score}/{w4Report.phases[phase].max_score}
                </span>
              </a>
            ))}
          </nav>
        )}

        {/* Bottom actions */}
        <div className="p-2 border-t border-gray-800 space-y-1">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full flex items-center gap-3 px-3 py-2 text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-lg transition-colors"
          >
            <span>{sidebarCollapsed ? '→' : '←'}</span>
            {!sidebarCollapsed && <span className="text-sm">Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Main Content - Takes remaining width, full height */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Header */}
        <header className="flex-shrink-0 bg-gray-900 border-b border-gray-800 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Status Badge */}
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                w4Report
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : processingStage === 'transcribing'
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : processingStage === 'analyzing'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : processingStage === 'error' || analysis?.processing_status === 'error'
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
              }`}>
                {w4Report ? '✓ Analyzed' : 
                 processingStage === 'transcribing' ? '🎙️ Transcribing...' :
                 processingStage === 'analyzing' ? '🤖 Analyzing...' : 
                 processingStage === 'error' || analysis?.processing_status === 'error' ? '✗ Error' :
                 'Ready'}
              </span>
              
              {/* Processing message */}
              {isAnalyzing && analysis?.current_chunk_message && (
                <span className="text-sm text-gray-400">{analysis.current_chunk_message}</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Start Analysis button - show when no W4 report and not analyzing */}
              {!w4Report && !isAnalyzing && (
                <button
                  onClick={handleStartAnalysis}
                  className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium rounded-lg hover:from-amber-600 hover:to-orange-600 transition-all flex items-center gap-2"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  <span>Start W4 Analysis</span>
                </button>
              )}
              
              {/* Re-Analyze button (when analysis exists) */}
              {w4Report && !isAnalyzing && (
                <>
                  <W4ExportButton 
                    report={w4Report}
                    fileName={`${recording.file_name.replace(/\.[^/.]+$/, '')}_w4_report`}
                  />
                  <button
                    onClick={handleStartAnalysis}
                    className="px-4 py-2 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-800 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    <span>Re-Analyze</span>
                  </button>
                </>
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

              <button 
                onClick={() => setDeleteModal(true)}
                className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                title="Delete recording"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-6 relative">
          {w4Report ? (
            <div className="space-y-6 max-w-5xl mx-auto">
              {/* Overall Performance */}
              <W4OverallPerformance
                performance={w4Report.overall_performance}
                clientName={w4Report.client_name}
                repName={w4Report.rep_name}
                companyName={w4Report.company_name}
              />

              {/* Phase Cards - 2x2 grid on desktop, 1 col on mobile */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div id="phase-why">
                  <W4PhaseCard
                    phaseName="WHY"
                    phase={w4Report.phases.why}
                    description={W4_PHASE_CONFIG.why.description}
                    color={phaseColors.why}
                  />
                </div>
                <div id="phase-what">
                  <W4PhaseCard
                    phaseName="WHAT"
                    phase={w4Report.phases.what}
                    description={W4_PHASE_CONFIG.what.description}
                    color={phaseColors.what}
                  />
                </div>
                <div id="phase-who">
                  <W4PhaseCard
                    phaseName="WHO"
                    phase={w4Report.phases.who}
                    description={W4_PHASE_CONFIG.who.description}
                    color={phaseColors.who}
                  />
                </div>
                <div id="phase-when">
                  <W4PhaseCard
                    phaseName="WHEN"
                    phase={w4Report.phases.when}
                    description={W4_PHASE_CONFIG.when.description}
                    color={phaseColors.when}
                  />
                </div>
              </div>

              {/* Total Scores */}
              <W4TotalScores
                phases={w4Report.phases}
                totalScore={w4Report.overall_performance.total_score}
              />

              {/* Insights */}
              <W4Insights
                whatDoneRight={w4Report.what_done_right}
                areasForImprovement={w4Report.areas_for_improvement}
                weakestElements={w4Report.weakest_elements}
              />

              {/* Coaching Recommendations */}
              <W4Coaching recommendations={w4Report.coaching_recommendations} />

              {/* Quick Wins & Rank Assessment */}
              <W4QuickWins
                quickWins={w4Report.quick_wins}
                rankAssessment={w4Report.rank_assessment}
              />
            </div>
          ) : isAnalyzing ? (
            /* Processing State - Centered */
            <div className="flex items-center justify-center h-full">
              <ProcessingStages
                currentStage={processingStage || 'pending'}
                message={analysis?.current_chunk_message}
                errorMessage={analysis?.error_message}
              />
            </div>
          ) : (
            /* No Analysis State */
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mb-6">
                <svg className="w-10 h-10 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">No W4 Analysis Yet</h2>
              <p className="text-gray-400 mb-6 max-w-md">
                Run the W4 Sales System analysis to get detailed coaching insights, checkpoint scores, and actionable recommendations.
              </p>
              {analysis?.processing_status === 'error' && analysis?.error_message && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg max-w-md">
                  <p className="text-sm text-red-400">{analysis.error_message}</p>
                </div>
              )}
              <button
                onClick={handleStartAnalysis}
                className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium rounded-lg hover:from-amber-600 hover:to-orange-600 transition-all flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                {analysis?.processing_status === 'error' ? 'Retry Analysis' : 'Start W4 Analysis'}
              </button>
            </div>
          )}
        </main>

        {/* Audio Player - Fixed at bottom */}
        <div className="flex-shrink-0 border-t border-gray-800 bg-gray-900 p-4">
          {audioUrl && recording.duration ? (
            <SimpleAudioPlayer
              src={audioUrl}
              duration={recording.duration}
              onTimeUpdate={setCurrentTime}
              playbackSpeed={playbackSpeed}
              onPlaybackSpeedChange={setPlaybackSpeed}
            />
          ) : (
            <div className="h-16 flex items-center justify-center text-gray-500">
              Loading audio player...
            </div>
          )}
        </div>
      </div>

      {/* Right Sidebar - Transcript - Full height like left sidebar */}
      <aside 
        className="w-96 flex-shrink-0 bg-gray-900 border-l border-gray-800 flex flex-col h-full"
        onMouseEnter={loadTranscript}
      >
        <TranscriptPanel
          transcript={transcript}
          w4Report={w4Report}
          currentTime={currentTime}
          onTimestampClick={seekToTimestamp}
          onGenerateTranscript={handleGenerateTranscript}
          isGenerating={transcriptGenerating}
          generatingProgress={transcriptProgress}
          isLoading={transcriptLoading}
        />
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
