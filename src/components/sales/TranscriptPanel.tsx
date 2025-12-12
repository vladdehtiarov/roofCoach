'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { TranscriptEntry } from '@/types/database'

interface Props {
  transcript: string | TranscriptEntry[] | null
  currentTime?: number
  onTimestampClick?: (timestamp: string) => void
  bookmarks?: { timestamp: string; text: string; label?: string }[]
  onAddComment?: (text: string) => void
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

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
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

export default function TranscriptPanel({ 
  transcript, 
  currentTime = 0, 
  onTimestampClick, 
  bookmarks = [],
  onAddComment 
}: Props) {
  const [activeTab, setActiveTab] = useState<'transcript' | 'bookmarks'>('transcript')
  const [searchQuery, setSearchQuery] = useState('')
  const [commentText, setCommentText] = useState('')
  const activeEntryRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Parse transcript if it's a string
  const entries: TranscriptEntry[] = useMemo(() => {
    if (!transcript) return []
    if (Array.isArray(transcript)) return transcript
    try {
      const parsed = JSON.parse(transcript)
      if (Array.isArray(parsed)) return parsed
      return []
    } catch {
      // Fallback: parse markdown-style transcript
      // Format: **Speaker:** Text
      const lines = transcript.split(/\*\*([^*]+):\*\*/).filter(Boolean)
      const result: TranscriptEntry[] = []
      for (let i = 0; i < lines.length - 1; i += 2) {
        const speaker = lines[i].trim()
        const text = lines[i + 1]?.trim() || ''
        if (speaker && text) {
          result.push({ speaker, text, timestamp: '0:00' })
        }
      }
      if (result.length === 0) {
        return [{ speaker: 'Transcript', text: transcript, timestamp: '0:00' }]
      }
      return result
    }
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

  // Find current entry based on playback time
  const currentEntryIndex = useMemo(() => {
    for (let i = entries.length - 1; i >= 0; i--) {
      if (parseTimestamp(entries[i].timestamp) <= currentTime) {
        return i
      }
    }
    return 0
  }, [entries, currentTime])

  // Auto-scroll to current entry
  useEffect(() => {
    if (activeEntryRef.current && !searchQuery) {
      activeEntryRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [currentEntryIndex, searchQuery])

  const handleSubmitComment = () => {
    if (commentText.trim() && onAddComment) {
      onAddComment(commentText.trim())
      setCommentText('')
    }
  }

  return (
    <div className="h-full flex flex-col bg-slate-900">
      {/* Header with Tabs */}
      <div className="flex-shrink-0 border-b border-slate-700/50">
        <div className="flex">
          <button
            onClick={() => setActiveTab('transcript')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'transcript'
                ? 'text-white border-b-2 border-amber-500'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            TRANSCRIPT
          </button>
          <button
            onClick={() => setActiveTab('bookmarks')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              activeTab === 'bookmarks'
                ? 'text-white border-b-2 border-amber-500'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Bookmarks
            {bookmarks.length > 0 && (
              <span className="px-1.5 py-0.5 bg-slate-700 rounded text-xs">
                {bookmarks.length}
              </span>
            )}
          </button>
        </div>

        {/* Search */}
        {activeTab === 'transcript' && (
          <div className="p-2">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"
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
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-h-0">
        {activeTab === 'transcript' ? (
          <div className="divide-y divide-slate-800/50">
            {filteredEntries.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                {searchQuery ? 'No matches found' : 'No transcript available'}
              </div>
            ) : (
              filteredEntries.map((entry, idx) => {
                const isActive = idx === currentEntryIndex && !searchQuery
                // Determine which field is name vs text
                // Name is usually shorter and contains only letters/spaces
                const speakerLooksLikeName = entry.speaker.length < 20 && /^[A-Za-z\s]+$/.test(entry.speaker)
                const textLooksLikeName = entry.text.length < 20 && /^[A-Za-z\s]+$/.test(entry.text)
                
                // If text looks like name (short, only letters), use it as name
                const speakerName = textLooksLikeName && !speakerLooksLikeName ? entry.text : entry.speaker
                const spokenText = textLooksLikeName && !speakerLooksLikeName ? entry.speaker : entry.text
                const styles = getSpeakerStyles(speakerName)
                
                return (
                  <div
                    key={idx}
                    ref={isActive ? activeEntryRef : null}
                    className={`px-4 py-3 transition-colors ${isActive ? 'bg-slate-800/30' : 'hover:bg-slate-800/20'}`}
                  >
                    {/* Speaker name with Avatar */}
                    <div className="flex items-center gap-3 mb-1">
                      {/* Avatar - initials from name */}
                      <div className={`w-8 h-8 rounded-full ${styles.avatar} flex items-center justify-center text-xs font-bold text-white flex-shrink-0`}>
                        {getInitials(speakerName)}
                      </div>
                      
                      {/* Speaker name - white */}
                      <span className="text-white font-medium text-sm">
                        {speakerName}
                      </span>
                    </div>
                    
                    {/* Text - gray, below */}
                    <p className="text-slate-400 text-sm leading-relaxed pl-11">
                      {spokenText}
                    </p>
                  </div>
                )
              })
            )}
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {bookmarks.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <div className="w-12 h-12 mx-auto rounded-full bg-slate-800 flex items-center justify-center mb-3">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                </div>
                <p>No bookmarks yet</p>
                <p className="text-xs text-slate-600 mt-1">Click timestamps to add bookmarks</p>
              </div>
            ) : (
              bookmarks.map((bookmark, idx) => (
                <button
                  key={idx}
                  onClick={() => onTimestampClick?.(bookmark.timestamp)}
                  className="w-full text-left p-3 bg-slate-800/50 rounded-lg hover:bg-slate-800 transition-colors group"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-amber-400 group-hover:text-amber-300">
                      {bookmark.timestamp}
                    </span>
                    {bookmark.label && (
                      <span className="px-2 py-0.5 bg-slate-700 rounded text-xs text-slate-300">
                        {bookmark.label}
                      </span>
                    )}
                  </div>
                  <p className="text-slate-300 text-sm">{bookmark.text}</p>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Comment Input - Always at bottom */}
      <div className="flex-shrink-0 border-t border-slate-700/50 p-3 bg-slate-900">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Leave a public comment on recording"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmitComment()}
            className="flex-1 px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-full text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          />
          <button
            onClick={handleSubmitComment}
            disabled={!commentText.trim()}
            className="p-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-full transition-colors"
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
