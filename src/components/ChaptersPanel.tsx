'use client'

import { useState, useEffect, useMemo } from 'react'

interface TimelineSegment {
  start_time: string
  end_time: string
  title: string
  summary: string
  topics?: string[]
}

interface ChaptersPanelProps {
  timeline: TimelineSegment[]
  currentTime: number
  duration: number
  onSeek: (seconds: number) => void
  isCompact?: boolean
}

// Parse time string "HH:MM:SS" or "MM:SS" to seconds
function parseTimeToSeconds(timeStr: string): number {
  const parts = timeStr.split(':').map(Number)
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1]
  }
  return 0
}

// Format seconds to "MM:SS" or "HH:MM:SS"
function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export default function ChaptersPanel({ 
  timeline, 
  currentTime, 
  duration,
  onSeek,
  isCompact = false 
}: ChaptersPanelProps) {
  const [isExpanded, setIsExpanded] = useState(!isCompact)

  // Find current chapter based on currentTime
  const currentChapterIndex = useMemo(() => {
    for (let i = timeline.length - 1; i >= 0; i--) {
      const startSeconds = parseTimeToSeconds(timeline[i].start_time)
      if (currentTime >= startSeconds) {
        return i
      }
    }
    return 0
  }, [timeline, currentTime])

  // Calculate chapter progress percentages for the progress bar
  const chapterSegments = useMemo(() => {
    return timeline.map((segment, index) => {
      const startSeconds = parseTimeToSeconds(segment.start_time)
      const endSeconds = parseTimeToSeconds(segment.end_time)
      const startPercent = (startSeconds / duration) * 100
      const widthPercent = ((endSeconds - startSeconds) / duration) * 100
      
      // Generate a color based on index
      const colors = [
        'bg-purple-500', 'bg-indigo-500', 'bg-blue-500', 'bg-cyan-500',
        'bg-teal-500', 'bg-emerald-500', 'bg-green-500', 'bg-lime-500',
        'bg-yellow-500', 'bg-amber-500', 'bg-orange-500', 'bg-rose-500'
      ]
      const color = colors[index % colors.length]
      
      return {
        ...segment,
        startPercent,
        widthPercent,
        color,
        startSeconds,
        endSeconds,
        index
      }
    })
  }, [timeline, duration])

  const currentChapter = timeline[currentChapterIndex]

  if (!timeline || timeline.length === 0) {
    return null
  }

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 overflow-hidden">
      {/* Header with current chapter */}
      <div className="px-4 py-3 border-b border-slate-700/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            <span className="text-white font-medium">Chapters</span>
            <span className="text-slate-500 text-sm">({timeline.length})</span>
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
          >
            <svg 
              className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
        
        {/* Current chapter indicator */}
        {currentChapter && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-slate-500">Now playing:</span>
            <span className="text-sm text-purple-400 font-medium truncate">
              {currentChapter.title}
            </span>
          </div>
        )}
      </div>

      {/* Chapter markers progress bar */}
      <div className="px-4 py-2 border-b border-slate-700/50">
        <div className="relative h-2 bg-slate-700 rounded-full overflow-hidden">
          {chapterSegments.map((segment, index) => (
            <button
              key={index}
              onClick={() => onSeek(segment.startSeconds)}
              className={`absolute h-full transition-opacity hover:opacity-80 ${segment.color} ${
                index === currentChapterIndex ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-800' : ''
              }`}
              style={{
                left: `${segment.startPercent}%`,
                width: `${Math.max(segment.widthPercent, 1)}%`,
              }}
              title={segment.title}
            />
          ))}
          {/* Current position indicator */}
          <div 
            className="absolute top-0 w-1 h-full bg-white shadow-lg z-10"
            style={{ left: `${(currentTime / duration) * 100}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-500 mt-1">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Chapter list */}
      {isExpanded && (
        <div className="max-h-[300px] overflow-y-auto">
          {timeline.map((chapter, index) => {
            const isActive = index === currentChapterIndex
            const startSeconds = parseTimeToSeconds(chapter.start_time)
            
            return (
              <button
                key={index}
                onClick={() => onSeek(startSeconds)}
                className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors border-l-2 ${
                  isActive 
                    ? 'bg-purple-500/10 border-purple-500' 
                    : 'border-transparent hover:bg-slate-700/30'
                }`}
              >
                {/* Chapter number */}
                <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                  isActive 
                    ? 'bg-purple-500 text-white' 
                    : 'bg-slate-700 text-slate-400'
                }`}>
                  {index + 1}
                </div>
                
                {/* Chapter info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-xs font-mono ${isActive ? 'text-purple-400' : 'text-slate-500'}`}>
                      {chapter.start_time}
                    </span>
                    {isActive && (
                      <span className="flex items-center gap-1 text-xs text-purple-400">
                        <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse" />
                        Playing
                      </span>
                    )}
                  </div>
                  <h4 className={`text-sm font-medium truncate ${isActive ? 'text-white' : 'text-slate-300'}`}>
                    {chapter.title}
                  </h4>
                  {!isCompact && (
                    <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                      {chapter.summary}
                    </p>
                  )}
                </div>

                {/* Play icon */}
                <div className={`flex-shrink-0 ${isActive ? 'text-purple-400' : 'text-slate-600'}`}>
                  {isActive ? (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Navigation buttons */}
      <div className="px-4 py-2 border-t border-slate-700/50 flex items-center justify-between">
        <button
          onClick={() => {
            const prevIndex = Math.max(0, currentChapterIndex - 1)
            onSeek(parseTimeToSeconds(timeline[prevIndex].start_time))
          }}
          disabled={currentChapterIndex === 0}
          className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Previous
        </button>
        
        <span className="text-xs text-slate-500">
          {currentChapterIndex + 1} / {timeline.length}
        </span>
        
        <button
          onClick={() => {
            const nextIndex = Math.min(timeline.length - 1, currentChapterIndex + 1)
            onSeek(parseTimeToSeconds(timeline[nextIndex].start_time))
          }}
          disabled={currentChapterIndex === timeline.length - 1}
          className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Next
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// Compact version for embedding near player
export function CurrentChapterIndicator({ 
  timeline, 
  currentTime,
  onSeek 
}: { 
  timeline: TimelineSegment[]
  currentTime: number
  onSeek: (seconds: number) => void
}) {
  const currentChapterIndex = useMemo(() => {
    for (let i = timeline.length - 1; i >= 0; i--) {
      const startSeconds = parseTimeToSeconds(timeline[i].start_time)
      if (currentTime >= startSeconds) {
        return i
      }
    }
    return 0
  }, [timeline, currentTime])

  const currentChapter = timeline[currentChapterIndex]
  const nextChapter = timeline[currentChapterIndex + 1]

  if (!currentChapter) return null

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-slate-800/80 rounded-lg">
      {/* Prev button */}
      <button
        onClick={() => {
          const prevIndex = Math.max(0, currentChapterIndex - 1)
          onSeek(parseTimeToSeconds(timeline[prevIndex].start_time))
        }}
        disabled={currentChapterIndex === 0}
        className="p-1 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="Previous chapter"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Current chapter info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse flex-shrink-0" />
          <span className="text-sm text-white font-medium truncate">{currentChapter.title}</span>
        </div>
        {nextChapter && (
          <p className="text-xs text-slate-500 truncate">
            Next: {nextChapter.title}
          </p>
        )}
      </div>

      {/* Next button */}
      <button
        onClick={() => {
          const nextIndex = Math.min(timeline.length - 1, currentChapterIndex + 1)
          onSeek(parseTimeToSeconds(timeline[nextIndex].start_time))
        }}
        disabled={currentChapterIndex === timeline.length - 1}
        className="p-1 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="Next chapter"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Chapter counter */}
      <span className="text-xs text-slate-500 font-mono">
        {currentChapterIndex + 1}/{timeline.length}
      </span>
    </div>
  )
}

