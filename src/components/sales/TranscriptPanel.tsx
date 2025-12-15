'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { TranscriptEntry } from '@/types/database'

interface Props {
  transcript: string | TranscriptEntry[] | null
  currentTime?: number
  onTimestampClick?: (timestamp: string) => void
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

const ITEMS_PER_PAGE = 50 // Only render 50 items at a time

export default function TranscriptPanel({ 
  transcript, 
  currentTime = 0, 
  onTimestampClick 
}: Props) {
  const [searchQuery, setSearchQuery] = useState('')
  const [displayCount, setDisplayCount] = useState(ITEMS_PER_PAGE)
  const activeEntryRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

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
    
    // Parse plain text format:
    // HH:MM:SS - Speaker Name
    //       What they said...
    const result: TranscriptEntry[] = []
    const lines = transcript.split('\n')
    let currentEntry: { speaker: string; timestamp: string; text: string[] } | null = null
    
    for (const line of lines) {
      // Match timestamp line: "00:00:00 - Speaker Name" or "0:00 - Speaker"
      const timestampMatch = line.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*(.+)$/)
      
      if (timestampMatch) {
        // Save previous entry
        if (currentEntry) {
          result.push({
            speaker: currentEntry.speaker,
            timestamp: currentEntry.timestamp,
            text: currentEntry.text.join(' ').trim()
          })
        }
        // Start new entry
        currentEntry = {
          timestamp: timestampMatch[1],
          speaker: timestampMatch[2].trim(),
          text: []
        }
      } else if (currentEntry && line.trim()) {
        // Add text to current entry
        currentEntry.text.push(line.trim())
      }
    }
    
    // Don't forget the last entry
    if (currentEntry) {
      result.push({
        speaker: currentEntry.speaker,
        timestamp: currentEntry.timestamp,
        text: currentEntry.text.join(' ').trim()
      })
    }
    
    // If no entries parsed, show raw transcript
    if (result.length === 0 && transcript.trim()) {
      return [{ speaker: 'Transcript', text: transcript, timestamp: '0:00' }]
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

  // Paginated entries - only show first N items
  const paginatedEntries = useMemo(() => {
    return filteredEntries.slice(0, displayCount)
  }, [filteredEntries, displayCount])

  const hasMore = filteredEntries.length > displayCount
  
  // Handle search change with pagination reset
  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    setDisplayCount(ITEMS_PER_PAGE) // Reset pagination when searching
  }

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

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-800">
        <div className="px-4 py-3">
          <h3 className="text-sm font-medium text-white">TRANSCRIPT</h3>
        </div>

        {/* Search */}
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
      </div>

      {/* Content */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-h-0">
        <div className="divide-y divide-gray-800/50">
          {filteredEntries.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              {searchQuery ? 'No matches found' : 'No transcript available'}
            </div>
          ) : (
            <>
            {/* Show item count */}
            <div className="px-4 py-2 text-xs text-gray-500 bg-gray-800/30">
              Showing {paginatedEntries.length} of {filteredEntries.length} entries
            </div>
            {paginatedEntries.map((entry, idx) => {
              const isActive = idx === currentEntryIndex && !searchQuery
              // Determine which field is name vs text
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
                  onClick={() => onTimestampClick?.(entry.timestamp)}
                  className={`px-4 py-3 transition-colors cursor-pointer ${isActive ? 'bg-gray-800/30' : 'hover:bg-gray-800/20'}`}
                >
                  {/* Speaker name with Avatar */}
                  <div className="flex items-center gap-3 mb-1">
                    {/* Avatar - initials from name */}
                    <div className={`w-8 h-8 rounded-full ${styles.avatar} flex items-center justify-center text-xs font-bold text-white flex-shrink-0`}>
                      {getInitials(speakerName)}
                    </div>
                    
                    {/* Speaker name and timestamp */}
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium text-sm">
                        {speakerName}
                      </span>
                      <span className="text-xs text-gray-500 font-mono">
                        {entry.timestamp}
                      </span>
                    </div>
                  </div>
                  
                  {/* Text - gray, below */}
                  <p className="text-gray-400 text-sm leading-relaxed pl-11">
                    {spokenText}
                  </p>
                </div>
              )
            })}
            {/* Load More button */}
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
            </>
          )}
        </div>
      </div>
    </div>
  )
}
