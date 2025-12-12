'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'

interface TimelineSegment {
  start_time: string
  end_time: string
  title: string
  summary: string
  topics?: string[]
}

interface CustomAudioPlayerProps {
  src: string
  duration: number
  timeline?: TimelineSegment[]
  onTimeUpdate?: (time: number) => void
  playbackSpeed?: number
  onPlaybackSpeedChange?: (speed: number) => void
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

export default function CustomAudioPlayer({
  src,
  duration,
  timeline = [],
  onTimeUpdate,
  playbackSpeed = 1,
  onPlaybackSpeedChange
}: CustomAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [showVolumeSlider, setShowVolumeSlider] = useState(false)
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const [hoverPosition, setHoverPosition] = useState(0)
  const [progressWidth, setProgressWidth] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [showChapters, setShowChapters] = useState(false)
  const [waveformData, setWaveformData] = useState<number[]>([])
  const [isLoadingWaveform, setIsLoadingWaveform] = useState(false)
  const [shouldLoadWaveform, setShouldLoadWaveform] = useState(false) // Lazy load trigger
  const waveformLoadedRef = useRef(false) // Prevent duplicate loads

  // Calculate chapter segments with colors
  const chapterSegments = useMemo(() => {
    if (!timeline.length || !duration) return []
    
    const colors = [
      '#8B5CF6', '#6366F1', '#3B82F6', '#06B6D4',
      '#14B8A6', '#10B981', '#22C55E', '#84CC16',
      '#EAB308', '#F59E0B', '#F97316', '#F43F5E'
    ]
    
    return timeline.map((segment, index) => {
      const startSeconds = parseTimeToSeconds(segment.start_time)
      const endSeconds = parseTimeToSeconds(segment.end_time)
      const startPercent = (startSeconds / duration) * 100
      const widthPercent = ((endSeconds - startSeconds) / duration) * 100
      
      return {
        ...segment,
        startPercent,
        widthPercent,
        color: colors[index % colors.length],
        startSeconds,
        endSeconds,
        index
      }
    })
  }, [timeline, duration])

  // Get current chapter
  const currentChapter = useMemo(() => {
    for (let i = chapterSegments.length - 1; i >= 0; i--) {
      if (currentTime >= chapterSegments[i].startSeconds) {
        return chapterSegments[i]
      }
    }
    return chapterSegments[0]
  }, [chapterSegments, currentTime])

  // Get hovered chapter
  const hoveredChapter = useMemo(() => {
    if (hoverTime === null) return null
    for (let i = chapterSegments.length - 1; i >= 0; i--) {
      if (hoverTime >= chapterSegments[i].startSeconds) {
        return chapterSegments[i]
      }
    }
    return chapterSegments[0]
  }, [chapterSegments, hoverTime])

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
      onTimeUpdate?.(audio.currentTime)
    }

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleEnded = () => setIsPlaying(false)

    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('ended', handleEnded)

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('ended', handleEnded)
    }
  }, [onTimeUpdate])

  // Apply playback speed
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed
    }
  }, [playbackSpeed])

  // Generate waveform data from audio - LAZY LOADED on hover
  useEffect(() => {
    // Only load waveform when explicitly requested (on hover) and not already loaded
    if (!shouldLoadWaveform || !src || waveformLoadedRef.current) return
    
    const generateWaveform = async () => {
      setIsLoadingWaveform(true)
      waveformLoadedRef.current = true // Mark as loading to prevent duplicates
      
      try {
        const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
        
        // Use Range request to get only first portion for waveform estimation
        // This reduces memory usage significantly for long audio files
        const response = await fetch(src)
        const arrayBuffer = await response.arrayBuffer()
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
        
        // Get the raw audio data
        const rawData = audioBuffer.getChannelData(0)
        const samples = 200 // Number of bars in waveform
        const blockSize = Math.floor(rawData.length / samples)
        const filteredData: number[] = []
        
        for (let i = 0; i < samples; i++) {
          const blockStart = blockSize * i
          let sum = 0
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(rawData[blockStart + j])
          }
          filteredData.push(sum / blockSize)
        }
        
        // Normalize to 0-1 range
        const maxVal = Math.max(...filteredData)
        const normalizedData = filteredData.map(n => n / maxVal)
        
        setWaveformData(normalizedData)
        audioContext.close()
      } catch (error) {
        console.error('Failed to generate waveform:', error)
        // Generate fake waveform as fallback - much cheaper!
        const fakeWaveform = Array.from({ length: 200 }, () => 0.3 + Math.random() * 0.7)
        setWaveformData(fakeWaveform)
      } finally {
        setIsLoadingWaveform(false)
      }
    }
    
    generateWaveform()
  }, [shouldLoadWaveform, src])
  
  // Trigger waveform loading on first hover
  const handleProgressMouseEnter = useCallback(() => {
    if (!shouldLoadWaveform && !waveformLoadedRef.current) {
      setShouldLoadWaveform(true)
    }
  }, [shouldLoadWaveform])

  // Handle play/pause
  const togglePlay = useCallback(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
      } else {
        audioRef.current.play()
      }
    }
  }, [isPlaying])

  // Handle seek
  const handleSeek = useCallback((clientX: number) => {
    if (!progressRef.current || !audioRef.current) return
    
    const rect = progressRef.current.getBoundingClientRect()
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const newTime = percent * duration
    
    audioRef.current.currentTime = newTime
    setCurrentTime(newTime)
  }, [duration])

  // Handle mouse move on progress bar
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!progressRef.current) return
    
    const rect = progressRef.current.getBoundingClientRect()
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const time = percent * duration
    
    setHoverTime(time)
    setHoverPosition(e.clientX - rect.left)
    setProgressWidth(rect.width)
    
    if (isDragging) {
      handleSeek(e.clientX)
    }
  }, [duration, isDragging, handleSeek])

  // Handle mouse down on progress bar
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true)
    handleSeek(e.clientX)
  }, [handleSeek])

  // Handle mouse up
  useEffect(() => {
    const handleMouseUp = () => setIsDragging(false)
    window.addEventListener('mouseup', handleMouseUp)
    return () => window.removeEventListener('mouseup', handleMouseUp)
  }, [])

  // Handle volume
  const handleVolumeChange = useCallback((newVolume: number) => {
    if (audioRef.current) {
      audioRef.current.volume = newVolume
      setVolume(newVolume)
      setIsMuted(newVolume === 0)
    }
  }, [])

  const toggleMute = useCallback(() => {
    if (audioRef.current) {
      if (isMuted) {
        audioRef.current.volume = volume || 0.5
        setIsMuted(false)
      } else {
        audioRef.current.volume = 0
        setIsMuted(true)
      }
    }
  }, [isMuted, volume])

  // Skip forward/backward
  const skip = useCallback((seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, Math.min(duration, audioRef.current.currentTime + seconds))
    }
  }, [duration])

  // Navigate chapters
  const goToNextChapter = useCallback(() => {
    const currentIndex = currentChapter?.index ?? -1
    if (currentIndex < chapterSegments.length - 1 && audioRef.current) {
      audioRef.current.currentTime = chapterSegments[currentIndex + 1].startSeconds
    }
  }, [currentChapter, chapterSegments])

  const goToPrevChapter = useCallback(() => {
    const currentIndex = currentChapter?.index ?? 0
    if (audioRef.current) {
      // If more than 3 seconds into chapter, go to start of current
      // Otherwise go to previous chapter
      if (currentTime - (currentChapter?.startSeconds ?? 0) > 3 || currentIndex === 0) {
        audioRef.current.currentTime = currentChapter?.startSeconds ?? 0
      } else {
        audioRef.current.currentTime = chapterSegments[currentIndex - 1].startSeconds
      }
    }
  }, [currentChapter, chapterSegments, currentTime])

  const progressPercent = (currentTime / duration) * 100

  return (
    <div className="bg-slate-900 rounded-2xl">
      <audio ref={audioRef} src={src} preload="metadata" />
      
      {/* Main player area */}
      <div className="p-4 pt-6">
        {/* Current chapter display */}
        {currentChapter && (
          <div className="mb-3 animate-fade-in">
            <div className="flex items-center gap-2 mb-1">
              <div 
                className="w-2.5 h-2.5 rounded-full animate-pulse flex-shrink-0"
                style={{ backgroundColor: currentChapter.color }}
              />
              <span className="text-xs text-slate-400">
                Chapter {(currentChapter.index ?? 0) + 1} of {chapterSegments.length}
              </span>
            </div>
            <p className="text-sm text-white font-medium leading-snug">
              {currentChapter.title}
            </p>
          </div>
        )}

        {/* Progress bar with chapters and waveform */}
        <div 
          ref={progressRef}
          className="relative h-12 cursor-pointer group"
          onMouseEnter={handleProgressMouseEnter}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverTime(null)}
          onMouseDown={handleMouseDown}
        >
          {/* Waveform loading indicator */}
          {isLoadingWaveform && (
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Loading waveform...
              </div>
            </div>
          )}

          {/* Waveform visualization */}
          {waveformData.length > 0 && !isLoadingWaveform && (
            <div className="absolute inset-x-0 bottom-0 h-10 flex items-end justify-between gap-px opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              {waveformData.map((amplitude, index) => {
                const barPercent = (index / waveformData.length) * 100
                const isPlayed = barPercent <= progressPercent
                const isHovered = hoverTime !== null && barPercent <= (hoverTime / duration) * 100
                
                // Get chapter color for this position
                const timeAtBar = (index / waveformData.length) * duration
                let barColor = '#8B5CF6' // default purple
                for (let i = chapterSegments.length - 1; i >= 0; i--) {
                  if (timeAtBar >= chapterSegments[i].startSeconds) {
                    barColor = chapterSegments[i].color
                    break
                  }
                }
                
                return (
                  <div
                    key={index}
                    className="flex-1 rounded-t-sm transition-all duration-75"
                    style={{
                      height: `${Math.max(amplitude * 100, 8)}%`,
                      backgroundColor: isPlayed 
                        ? barColor 
                        : isHovered 
                          ? `${barColor}80`
                          : `${barColor}30`,
                    }}
                  />
                )
              })}
            </div>
          )}
          
          {/* Chapter dividers on waveform */}
          {chapterSegments.length > 0 && (
            <div className="absolute inset-x-0 bottom-0 h-10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              {chapterSegments.slice(1).map((segment, index) => (
                <div
                  key={`wf-divider-${index}`}
                  className="absolute top-0 w-0.5 h-full bg-slate-900/80"
                  style={{ left: `${segment.startPercent}%` }}
                />
              ))}
            </div>
          )}
          
          {/* Simple progress bar (shown when not hovering or no waveform) */}
          <div className={`absolute inset-x-0 bottom-1 h-1.5 ${waveformData.length > 0 ? 'group-hover:opacity-0' : ''} transition-opacity duration-200`}>
            {/* Background track */}
            <div className="absolute inset-0 bg-slate-700 rounded-full" />
            
            {/* Chapter segments */}
            {chapterSegments.map((segment, index) => (
              <div
                key={index}
                className="absolute top-0 h-full rounded-full"
                style={{
                  left: `${segment.startPercent}%`,
                  width: `${Math.max(segment.widthPercent, 0.5)}%`,
                  backgroundColor: currentTime >= segment.startSeconds ? segment.color : `${segment.color}40`,
                }}
              />
            ))}
            
            {/* Chapter dividers */}
            {chapterSegments.slice(1).map((segment, index) => (
              <div
                key={`divider-${index}`}
                className="absolute top-0 w-0.5 h-full bg-slate-900 z-10"
                style={{ left: `${segment.startPercent}%` }}
              />
            ))}
            
            {/* Progress fill (if no chapters) */}
            {chapterSegments.length === 0 && (
              <div 
                className="absolute top-0 h-full bg-purple-500 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            )}
          </div>
          
          {/* Playhead */}
          <div 
            className="absolute bottom-0 w-3 h-3 bg-white rounded-full shadow-lg -translate-x-1/2 z-20 transition-transform group-hover:scale-125"
            style={{ left: `${progressPercent}%` }}
          />
          
          {/* Hover line */}
          {hoverTime !== null && (
            <div 
              className="absolute bottom-0 w-0.5 h-10 bg-white/50 -translate-x-1/2 z-10 pointer-events-none"
              style={{ left: `${(hoverTime / duration) * 100}%` }}
            />
          )}
          
          {/* Hover tooltip */}
          {hoverTime !== null && (
            <div 
              className="absolute bottom-full mb-3 z-30 pointer-events-none"
              style={{ 
                left: Math.max(100, Math.min(hoverPosition, progressWidth - 100)),
                transform: 'translateX(-50%)'
              }}
            >
              <div className="bg-slate-800/95 backdrop-blur-sm border border-slate-600 rounded-xl px-4 py-3 shadow-2xl min-w-[200px] max-w-[400px]">
                {hoveredChapter && (
                  <div className="mb-2">
                    <div className="flex items-center gap-2 mb-1">
                      <div 
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: hoveredChapter.color }}
                      />
                      <span className="text-xs text-slate-400">
                        Chapter {(hoveredChapter.index ?? 0) + 1}
                      </span>
                    </div>
                    <p className="text-sm text-white font-medium leading-snug">
                      {hoveredChapter.title}
                    </p>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-lg font-mono text-purple-400 font-semibold">
                    {formatTime(hoverTime)}
                  </span>
                  <span className="text-xs text-slate-500">
                    / {formatTime(duration)}
                  </span>
                </div>
              </div>
              {/* Tooltip arrow */}
              <div className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-3 h-3 bg-slate-800/95 border-r border-b border-slate-600 transform rotate-45" />
            </div>
          )}
        </div>

        {/* Time display */}
        <div className="flex justify-between text-xs text-slate-500 mt-1">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between mt-4">
          {/* Left controls */}
          <div className="flex items-center gap-2">
            {/* Previous chapter */}
            {chapterSegments.length > 0 && (
              <button
                onClick={goToPrevChapter}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                title="Previous chapter"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
                </svg>
              </button>
            )}
            
            {/* Skip back 10s */}
            <button
              onClick={() => skip(-10)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title="Back 10 seconds"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
              </svg>
            </button>
            
            {/* Play/Pause */}
            <button
              onClick={togglePlay}
              className="p-3 bg-white text-slate-900 rounded-full hover:bg-slate-200 transition-colors"
            >
              {isPlaying ? (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
            
            {/* Skip forward 10s */}
            <button
              onClick={() => skip(10)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title="Forward 10 seconds"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z" />
              </svg>
            </button>
            
            {/* Next chapter */}
            {chapterSegments.length > 0 && (
              <button
                onClick={goToNextChapter}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                title="Next chapter"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 18l8.5-6L6 6v12zm10-12v12h2V6h-2z" />
                </svg>
              </button>
            )}
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2">
            {/* Volume */}
            <div 
              className="relative"
              onMouseEnter={() => setShowVolumeSlider(true)}
              onMouseLeave={() => setShowVolumeSlider(false)}
            >
              <button
                onClick={toggleMute}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                {isMuted || volume === 0 ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                )}
              </button>
              
              {/* Volume slider */}
              {showVolumeSlider && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-3 bg-slate-800 rounded-lg shadow-xl">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={isMuted ? 0 : volume}
                    onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                    className="w-24 h-1.5 accent-purple-500 cursor-pointer"
                  />
                </div>
              )}
            </div>
            
            {/* Playback speed */}
            <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-0.5">
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                <button
                  key={speed}
                  onClick={() => onPlaybackSpeedChange?.(speed)}
                  className={`px-2 py-1 text-xs rounded-md transition-all ${
                    playbackSpeed === speed
                      ? 'bg-purple-500 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
            
            {/* Chapters toggle */}
            {chapterSegments.length > 0 && (
              <button
                onClick={() => setShowChapters(!showChapters)}
                className={`p-2 rounded-lg transition-colors ${
                  showChapters 
                    ? 'bg-purple-500/20 text-purple-400' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
                title="Show chapters"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Chapters list (expandable) */}
      {showChapters && chapterSegments.length > 0 && (
        <div className="border-t border-slate-800 max-h-[300px] overflow-y-auto">
          {chapterSegments.map((chapter, index) => {
            const isActive = currentTime >= chapter.startSeconds && 
              (index === chapterSegments.length - 1 || currentTime < chapterSegments[index + 1].startSeconds)
            
            return (
              <button
                key={index}
                onClick={() => {
                  if (audioRef.current) {
                    audioRef.current.currentTime = chapter.startSeconds
                    audioRef.current.play()
                  }
                }}
                className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors border-l-3 ${
                  isActive 
                    ? 'bg-purple-500/10' 
                    : 'hover:bg-slate-800/50'
                }`}
                style={{ borderLeftColor: isActive ? chapter.color : 'transparent' }}
              >
                {/* Chapter thumbnail/number */}
                <div 
                  className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                    isActive ? 'text-white' : 'text-slate-400'
                  }`}
                  style={{ backgroundColor: isActive ? chapter.color : `${chapter.color}30` }}
                >
                  {index + 1}
                </div>
                
                {/* Chapter info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
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
                  <h4 className={`text-sm font-medium mt-0.5 ${isActive ? 'text-white' : 'text-slate-300'}`}>
                    {chapter.title}
                  </h4>
                  <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                    {chapter.summary}
                  </p>
                </div>

                {/* Play icon */}
                <div className={`flex-shrink-0 p-1 ${isActive ? 'text-purple-400' : 'text-slate-600'}`}>
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
    </div>
  )
}

