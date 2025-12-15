'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { TranscriptEntry, W4Report, W4Phase } from '@/types/database'

interface Props {
  transcript: string | TranscriptEntry[] | null
  w4Report?: W4Report | null
  currentTime?: number
  onTimestampClick?: (timestamp: string) => void
  onGenerateTranscript?: () => void
  isGenerating?: boolean
  generatingProgress?: string | null
  isLoading?: boolean
}

function parseTimestamp(ts: string): number {
  if (!ts) return 0
  const parts = ts.split(':').map(Number)
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1]
  }
  return 0
}

// Get initials from speaker name
function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()
}

// Get color for speaker
function getSpeakerStyles(speaker: string): { bg: string; text: string; avatar: string } {
  const isCustomer = speaker.toLowerCase().includes('customer') || 
                     speaker.toLowerCase().includes('client') ||
                     speaker.toLowerCase().includes('homeowner')
  
  if (isCustomer) {
    return { bg: 'bg-blue-500/10', text: 'text-blue-400', avatar: 'bg-blue-500' }
  }
  return { bg: 'bg-amber-500/10', text: 'text-amber-400', avatar: 'bg-amber-500' }
}

const ITEMS_PER_PAGE = 50

// Extract key insights from W4 checkpoints (best performing ones)
function extractKeyInsights(w4Report: W4Report | null | undefined): Array<{phase: string, checkpoint: string, score: number, maxScore: number, insight: string}> {
  if (!w4Report?.phases) return []
  
  const insights: Array<{phase: string, checkpoint: string, score: number, maxScore: number, insight: string}> = []
  const phaseNames: Record<string, string> = {
    why: 'WHY',
    what: 'WHAT', 
    who: 'WHO',
    when: 'WHEN'
  }
  
  for (const [phaseKey, phase] of Object.entries(w4Report.phases)) {
    const phaseData = phase as W4Phase
    if (phaseData?.checkpoints) {
      for (const checkpoint of phaseData.checkpoints) {
        if (checkpoint.justification && checkpoint.score > 0) {
          insights.push({
            phase: phaseNames[phaseKey] || phaseKey,
            checkpoint: checkpoint.name,
            score: checkpoint.score,
            maxScore: checkpoint.max_score,
            insight: checkpoint.justification.length > 200 
              ? checkpoint.justification.substring(0, 200) + '...' 
              : checkpoint.justification
          })
        }
      }
    }
  }
  
  // Sort by score percentage (best first) and take top 6
  return insights
    .sort((a, b) => (b.score / b.maxScore) - (a.score / a.maxScore))
    .slice(0, 6)
}

export default function TranscriptPanel({ 
  transcript, 
  w4Report,
  currentTime = 0, 
  onTimestampClick,
  onGenerateTranscript,
  isGenerating = false,
  generatingProgress = null,
  isLoading = false,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('')
  const [displayCount, setDisplayCount] = useState(ITEMS_PER_PAGE)
  const [showFullTranscript] = useState(false)
  const activeEntryRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Extract key insights from W4 report
  const keyInsights = useMemo(() => extractKeyInsights(w4Report), [w4Report])

  // Parse transcript - supports both plain text and JSON formats
  const entries: TranscriptEntry[] = useMemo(() => {
    if (!transcript) return []
    if (Array.isArray(transcript)) return transcript
    
    // Try JSON first (legacy format)
    try {
      const parsed = JSON.parse(transcript)
      if (Array.isArray(parsed)) return parsed
    } catch {
      // Not JSON, continue to plain text parsing
    }
    
    // Parse plain text format - multiple format support
    const rawEntries: TranscriptEntry[] = []
    const lines = transcript.split('\n')
    let currentEntry: { speaker: string; timestamp: string; text: string[] } | null = null
    
    for (const line of lines) {
      // Format 1: "0:00 - Speaker Name" or "00:00:00 - Speaker Name"
      const format1 = line.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–—:]\s*(.+)$/)
      // Format 2: "[0:00] Speaker Name:" or "(00:00) Speaker:"
      const format2 = line.match(/^[\[(]?(\d{1,2}:\d{2}(?::\d{2})?)[\])]?\s*([^:]+):?\s*$/)
      // Format 3: "Speaker Name (0:00):" or "Speaker [00:00]"
      const format3 = line.match(/^([^(\[]+)\s*[\[(](\d{1,2}:\d{2}(?::\d{2})?)[\])]:?\s*$/)
      // Format 4: "**0:00** - Speaker" (markdown bold timestamps)
      const format4 = line.match(/^\*?\*?(\d{1,2}:\d{2}(?::\d{2})?)\*?\*?\s*[-–—:]\s*(.+)$/)
      
      const match = format1 || format4
      const matchAlt = format2 || format3
      
      if (match) {
        if (currentEntry && currentEntry.text.length > 0) {
          rawEntries.push({
            speaker: currentEntry.speaker,
            timestamp: currentEntry.timestamp,
            text: currentEntry.text.join(' ').trim()
          })
        }
        currentEntry = {
          timestamp: match[1],
          speaker: match[2].trim().replace(/:$/, ''),
          text: []
        }
      } else if (matchAlt) {
        if (currentEntry && currentEntry.text.length > 0) {
          rawEntries.push({
            speaker: currentEntry.speaker,
            timestamp: currentEntry.timestamp,
            text: currentEntry.text.join(' ').trim()
          })
        }
        const ts = format2 ? matchAlt[1] : matchAlt[2]
        const spk = format2 ? matchAlt[2] : matchAlt[1]
        currentEntry = {
          timestamp: ts,
          speaker: spk.trim().replace(/:$/, ''),
          text: []
        }
      } else if (currentEntry && line.trim()) {
        // Add non-empty lines as text content
        currentEntry.text.push(line.trim())
      }
    }
    
    // Don't forget the last entry
    if (currentEntry && currentEntry.text.length > 0) {
      rawEntries.push({
        speaker: currentEntry.speaker,
        timestamp: currentEntry.timestamp,
        text: currentEntry.text.join(' ').trim()
      })
    }
    
    // Fallback: if no entries parsed, show raw transcript
    if (rawEntries.length === 0 && transcript.trim()) {
      // Try to split by any pattern that looks like speaker changes
      const fallbackEntries = transcript.split(/(?=\d{1,2}:\d{2})/g).filter(Boolean)
      if (fallbackEntries.length > 1) {
        return fallbackEntries.map((chunk, i) => ({
          speaker: `Segment ${i + 1}`,
          text: chunk.trim(),
          timestamp: chunk.match(/(\d{1,2}:\d{2}(?::\d{2})?)/)?.[1] || '0:00'
        }))
      }
      return [{ speaker: 'Transcript', text: transcript, timestamp: '0:00' }]
    }
    
    // Split long entries into smaller chunks (max ~200 words per entry)
    const MAX_WORDS = 200
    const result: TranscriptEntry[] = []
    
    for (const entry of rawEntries) {
      const words = entry.text.split(/\s+/)
      if (words.length <= MAX_WORDS) {
        result.push(entry)
      } else {
        // Split into chunks
        for (let i = 0; i < words.length; i += MAX_WORDS) {
          const chunk = words.slice(i, i + MAX_WORDS).join(' ')
          result.push({
            speaker: entry.speaker,
            timestamp: i === 0 ? entry.timestamp : `${entry.timestamp}+`,
            text: chunk
          })
        }
      }
    }
    
    return result
  }, [transcript])

  // Filter by search
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries
    const query = searchQuery.toLowerCase()
    return entries.filter(e => 
      e.text.toLowerCase().includes(query) || 
      e.speaker.toLowerCase().includes(query)
    )
  }, [entries, searchQuery])

  const paginatedEntries = useMemo(() => {
    return filteredEntries.slice(0, displayCount)
  }, [filteredEntries, displayCount])

  const hasMore = filteredEntries.length > displayCount
  
  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    setDisplayCount(ITEMS_PER_PAGE)
  }

  const currentEntryIndex = useMemo(() => {
    for (let i = entries.length - 1; i >= 0; i--) {
      if (parseTimestamp(entries[i].timestamp) <= currentTime) {
        return i
      }
    }
    return 0
  }, [entries, currentTime])

  useEffect(() => {
    if (activeEntryRef.current && !searchQuery) {
      activeEntryRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [currentEntryIndex, searchQuery])

  const hasTranscript = entries.length > 0
  const hasKeyInsights = keyInsights.length > 0
  const showKeyInsightsView = !hasTranscript && hasKeyInsights && !showFullTranscript && !isGenerating

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-800">
        <div className="px-4 py-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-white">
            {hasTranscript ? 'TRANSCRIPT' : 'KEY QUOTES'}
          </h3>
          {hasTranscript && (
            <span className="text-xs text-gray-500">{entries.length} entries</span>
          )}
        </div>

        {/* Search - only show if we have transcript */}
        {hasTranscript && (
          <div className="p-2">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search transcript..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-h-0">
        
        {/* Key Insights View (when no full transcript) */}
        {showKeyInsightsView && (
          <div className="p-4 pb-24"> {/* Extra padding bottom for sticky button */}
            {/* Key Insights Header */}
            <div className="mb-4 p-3 bg-gradient-to-r from-amber-500/10 to-orange-500/10 rounded-lg border border-amber-500/20">
              <div className="flex items-center gap-2 mb-1">
                <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <span className="text-sm font-medium text-amber-400">Top Performance Highlights</span>
              </div>
              <p className="text-xs text-gray-400">
                Best scoring checkpoints from W4 analysis
              </p>
            </div>

            {/* Insights List */}
            <div className="space-y-3">
              {keyInsights.map((item, idx) => (
                <div key={idx} className="p-3 bg-gray-800/50 rounded-lg border border-gray-700/50 hover:bg-gray-800/70 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white bg-amber-500/80 px-2 py-0.5 rounded">
                        {item.phase}
                      </span>
                      <span className="text-xs text-gray-400 truncate max-w-[140px]">{item.checkpoint}</span>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                      item.score === item.maxScore ? 'bg-green-500/20 text-green-400' :
                      item.score >= item.maxScore * 0.7 ? 'bg-amber-500/20 text-amber-400' :
                      'bg-gray-700 text-gray-400'
                    }`}>
                      {item.score}/{item.maxScore}
                    </span>
                  </div>
                  <p className="text-sm text-gray-300 leading-relaxed">{item.insight}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State - No Insights & No Transcript */}
        {!hasTranscript && !hasKeyInsights && !isGenerating && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <h4 className="text-white font-medium mb-2">No Transcript Yet</h4>
            <p className="text-gray-500 text-sm mb-6 max-w-xs">
              Generate a full transcript of this call to read and search through the conversation.
            </p>
            {onGenerateTranscript && (
              <button
                onClick={onGenerateTranscript}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-medium rounded-lg text-sm transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                Generate Transcript
              </button>
            )}
          </div>
        )}

        {/* Generating State */}
        {isGenerating && (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            {/* Animated icon */}
            <div className="relative w-20 h-20 mb-6">
              <div className="absolute inset-0 rounded-full bg-amber-500/20 animate-ping" />
              <div className="relative w-full h-full rounded-full bg-gradient-to-br from-amber-500/30 to-orange-500/30 border-2 border-amber-500/50 flex items-center justify-center">
                <svg className="w-10 h-10 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
            </div>

            <h4 className="text-white font-semibold text-lg mb-2">Generating Transcript</h4>
            
            {/* Progress info */}
            <div className="w-full max-w-xs space-y-3">
              {/* Status message */}
              <div className="px-4 py-2 bg-gray-800/50 rounded-lg">
                <p className="text-amber-400 text-sm font-medium">
                  {generatingProgress || 'Starting transcript generation...'}
                </p>
              </div>

              {/* Visual progress bar */}
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-500"
                  style={{ 
                    width: generatingProgress?.includes('chars') 
                      ? `${Math.min(95, parseInt(generatingProgress.match(/(\d+)k/)?.[1] || '0') * 2)}%` 
                      : '15%' 
                  }} 
                />
              </div>

              {/* Live stats */}
              {generatingProgress?.includes('chars') && (
                <div className="flex items-center justify-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-green-400">Streaming</span>
                  </div>
                  <div className="text-gray-500">
                    ~{Math.round(parseInt(generatingProgress.match(/(\d+)k/)?.[1] || '0') * 0.2)} words
                  </div>
                </div>
              )}
            </div>

            <p className="text-xs text-gray-600 mt-6">
              AI is listening to the entire recording...
            </p>
          </div>
        )}

        {/* Loading State */}
        {isLoading && !isGenerating && (
          <div className="flex flex-col items-center justify-center h-full p-8">
            <div className="w-8 h-8 border-2 border-gray-700 border-t-amber-500 rounded-full animate-spin" />
            <p className="text-gray-500 text-sm mt-4">Loading transcript...</p>
          </div>
        )}

        {/* Full Transcript Content */}
        {hasTranscript && !isGenerating && !isLoading && (
          <div className="divide-y divide-gray-800/50">
            <div className="px-4 py-2 text-xs text-gray-500 bg-gray-800/30">
              Showing {paginatedEntries.length} of {filteredEntries.length} entries
            </div>
            {paginatedEntries.map((entry, idx) => {
              const isActive = idx === currentEntryIndex && !searchQuery
              const speakerLooksLikeName = entry.speaker.length < 20 && /^[A-Za-z\s]+$/.test(entry.speaker)
              const textLooksLikeName = entry.text.length < 20 && /^[A-Za-z\s]+$/.test(entry.text)
              
              const speakerName = textLooksLikeName && !speakerLooksLikeName ? entry.text : entry.speaker
              const spokenText = textLooksLikeName && !speakerLooksLikeName ? entry.speaker : entry.text
              const styles = getSpeakerStyles(speakerName)
              
              return (
                <div
                  key={idx}
                  ref={isActive ? activeEntryRef : null}
                  onClick={() => onTimestampClick?.(entry.timestamp)}
                  className={`px-4 py-3 transition-colors cursor-pointer ${isActive ? 'bg-gray-800/30' : 'hover:bg-gray-800/20'}`}
                >
                  <div className="flex items-center gap-3 mb-1">
                    <div className={`w-8 h-8 rounded-full ${styles.avatar} flex items-center justify-center text-xs font-bold text-white flex-shrink-0`}>
                      {getInitials(speakerName)}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium text-sm">{speakerName}</span>
                      <span className="text-xs text-gray-500 font-mono">{entry.timestamp}</span>
                    </div>
                  </div>
                  <p className="text-gray-400 text-sm leading-relaxed pl-11">{spokenText}</p>
                </div>
              )
            })}
            {hasMore && (
              <div className="p-4">
                <button
                  onClick={() => setDisplayCount(prev => prev + ITEMS_PER_PAGE)}
                  className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition-colors"
                >
                  Load More ({filteredEntries.length - displayCount} remaining)
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sticky Footer - Generate Transcript Button (when showing key insights) */}
      {showKeyInsightsView && onGenerateTranscript && (
        <div className="flex-shrink-0 p-4 border-t border-gray-800 bg-gray-900/95 backdrop-blur">
          <button
            onClick={onGenerateTranscript}
            className="w-full px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-black font-medium rounded-lg text-sm transition-all flex items-center justify-center gap-2 shadow-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            Generate Full Transcript
          </button>
          <p className="text-xs text-gray-500 text-center mt-2">
            Get the complete word-by-word transcript
          </p>
        </div>
      )}
    </div>
  )
}
