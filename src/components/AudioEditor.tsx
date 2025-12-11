'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useToast } from '@/components/ui/Toast'

interface AudioEditorProps {
  audioUrl: string
  fileName: string
  onSave?: (blob: Blob, fileName: string) => Promise<void>
  onCancel?: () => void
}

interface Selection {
  start: number // 0-1 percentage
  end: number   // 0-1 percentage
}

type EditMode = 'trim' | 'cut' | null

export default function AudioEditor({ audioUrl, fileName, onSave, onCancel }: AudioEditorProps) {
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null)
  const [waveformData, setWaveformData] = useState<number[]>([])
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [editMode, setEditMode] = useState<EditMode>(null)
  const [isDragging, setIsDragging] = useState<'start' | 'end' | 'move' | null>(null)
  const [zoom, setZoom] = useState(1)
  const [scrollPosition, setScrollPosition] = useState(0)
  
  // History for undo
  const [history, setHistory] = useState<AudioBuffer[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null)
  const startTimeRef = useRef<number>(0)
  const animationFrameRef = useRef<number | null>(null)

  const toast = useToast()

  // Load and decode audio
  useEffect(() => {
    loadAudio()
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      stopPlayback()
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [audioUrl])

  // Draw waveform when data changes
  useEffect(() => {
    drawWaveform()
  }, [waveformData, selection, currentTime, zoom, scrollPosition, editMode])

  const loadAudio = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(audioUrl)
      const arrayBuffer = await response.arrayBuffer()
      
      const audioContext = new AudioContext()
      audioContextRef.current = audioContext
      
      const buffer = await audioContext.decodeAudioData(arrayBuffer)
      setAudioBuffer(buffer)
      setDuration(buffer.duration)
      
      // Add to history
      setHistory([buffer])
      setHistoryIndex(0)
      
      // Generate waveform data
      generateWaveformData(buffer)
    } catch (err) {
      console.error('Error loading audio:', err)
      toast.error('Failed to load audio for editing')
    } finally {
      setIsLoading(false)
    }
  }

  const generateWaveformData = (buffer: AudioBuffer, samples: number = 500) => {
    const channelData = buffer.getChannelData(0)
    const blockSize = Math.floor(channelData.length / samples)
    const waveform: number[] = []
    
    for (let i = 0; i < samples; i++) {
      let sum = 0
      for (let j = 0; j < blockSize; j++) {
        sum += Math.abs(channelData[i * blockSize + j] || 0)
      }
      // Normalize and apply some smoothing
      waveform.push(Math.min(1, (sum / blockSize) * 3))
    }
    
    setWaveformData(waveform)
  }

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || waveformData.length === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = canvas
    const centerY = height / 2
    const barWidth = (width * zoom) / waveformData.length
    const visibleStart = Math.floor(scrollPosition * waveformData.length)
    const visibleEnd = Math.min(waveformData.length, visibleStart + Math.ceil(waveformData.length / zoom))

    // Clear canvas
    ctx.fillStyle = '#1e293b'
    ctx.fillRect(0, 0, width, height)

    // Draw selection background
    if (selection && editMode) {
      const selectionStartX = (selection.start - scrollPosition) * width * zoom
      const selectionEndX = (selection.end - scrollPosition) * width * zoom
      
      if (editMode === 'trim') {
        // Gray out parts that will be removed
        ctx.fillStyle = 'rgba(100, 116, 139, 0.5)'
        ctx.fillRect(0, 0, selectionStartX, height)
        ctx.fillRect(selectionEndX, 0, width - selectionEndX, height)
      } else if (editMode === 'cut') {
        // Highlight part that will be removed
        ctx.fillStyle = 'rgba(239, 68, 68, 0.2)'
        ctx.fillRect(selectionStartX, 0, selectionEndX - selectionStartX, height)
      }
    }

    // Draw waveform bars
    for (let i = visibleStart; i < visibleEnd; i++) {
      const x = (i - visibleStart) * barWidth
      const amplitude = waveformData[i]
      const barHeight = amplitude * (height * 0.8)
      
      // Color based on selection
      let color = '#f59e0b' // Amber default
      
      if (selection && editMode) {
        const position = i / waveformData.length
        if (editMode === 'trim') {
          if (position < selection.start || position > selection.end) {
            color = '#475569' // Gray for trimmed parts
          } else {
            color = '#22c55e' // Green for kept parts
          }
        } else if (editMode === 'cut') {
          if (position >= selection.start && position <= selection.end) {
            color = '#ef4444' // Red for cut parts
          }
        }
      }
      
      // Gradient effect
      const gradient = ctx.createLinearGradient(x, centerY - barHeight / 2, x, centerY + barHeight / 2)
      gradient.addColorStop(0, color)
      gradient.addColorStop(0.5, color)
      gradient.addColorStop(1, color)
      
      ctx.fillStyle = gradient
      ctx.fillRect(x, centerY - barHeight / 2, Math.max(1, barWidth - 1), barHeight)
    }

    // Draw selection handles
    if (selection && editMode) {
      const selectionStartX = (selection.start - scrollPosition) * width * zoom
      const selectionEndX = (selection.end - scrollPosition) * width * zoom
      
      // Start handle
      ctx.fillStyle = editMode === 'trim' ? '#22c55e' : '#ef4444'
      ctx.fillRect(selectionStartX - 2, 0, 4, height)
      ctx.beginPath()
      ctx.arc(selectionStartX, height / 2, 8, 0, Math.PI * 2)
      ctx.fill()
      
      // End handle
      ctx.fillRect(selectionEndX - 2, 0, 4, height)
      ctx.beginPath()
      ctx.arc(selectionEndX, height / 2, 8, 0, Math.PI * 2)
      ctx.fill()
    }

    // Draw playhead
    if (duration > 0) {
      const playheadX = ((currentTime / duration) - scrollPosition) * width * zoom
      if (playheadX >= 0 && playheadX <= width) {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(playheadX - 1, 0, 2, height)
        
        // Playhead triangle
        ctx.beginPath()
        ctx.moveTo(playheadX - 6, 0)
        ctx.lineTo(playheadX + 6, 0)
        ctx.lineTo(playheadX, 10)
        ctx.closePath()
        ctx.fill()
      }
    }

    // Draw time markers
    ctx.fillStyle = '#64748b'
    ctx.font = '10px monospace'
    const markerInterval = Math.max(1, Math.floor(duration / 10))
    for (let t = 0; t <= duration; t += markerInterval) {
      const x = ((t / duration) - scrollPosition) * width * zoom
      if (x >= 0 && x <= width) {
        ctx.fillText(formatTime(t), x, height - 4)
      }
    }
  }, [waveformData, selection, currentTime, duration, zoom, scrollPosition, editMode])

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Playback controls
  const togglePlayback = () => {
    if (isPlaying) {
      stopPlayback()
    } else {
      startPlayback()
    }
  }

  const startPlayback = (startAt?: number) => {
    if (!audioBuffer || !audioContextRef.current) return

    stopPlayback()

    const source = audioContextRef.current.createBufferSource()
    source.buffer = audioBuffer
    source.connect(audioContextRef.current.destination)
    
    const startTime = startAt ?? currentTime
    startTimeRef.current = audioContextRef.current.currentTime - startTime
    
    source.start(0, startTime)
    sourceNodeRef.current = source
    setIsPlaying(true)

    source.onended = () => {
      setIsPlaying(false)
      setCurrentTime(0)
    }

    // Update playhead position
    const updatePlayhead = () => {
      if (audioContextRef.current && isPlaying) {
        const elapsed = audioContextRef.current.currentTime - startTimeRef.current
        if (elapsed < duration) {
          setCurrentTime(elapsed)
          animationFrameRef.current = requestAnimationFrame(updatePlayhead)
        }
      }
    }
    animationFrameRef.current = requestAnimationFrame(updatePlayhead)
  }

  const stopPlayback = () => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop()
      sourceNodeRef.current = null
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    setIsPlaying(false)
  }

  // Selection handling
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!editMode) return
    
    const canvas = canvasRef.current
    if (!canvas) return
    
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const position = (x / zoom) + scrollPosition
    
    if (selection) {
      // Check if clicking on handles
      const handleThreshold = 0.02
      if (Math.abs(position - selection.start) < handleThreshold) {
        setIsDragging('start')
        return
      }
      if (Math.abs(position - selection.end) < handleThreshold) {
        setIsDragging('end')
        return
      }
    }
    
    // Start new selection
    setSelection({ start: position, end: position })
    setIsDragging('end')
  }

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || !selection) return
    
    const canvas = canvasRef.current
    if (!canvas) return
    
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const position = Math.max(0, Math.min(1, (x / zoom) + scrollPosition))
    
    if (isDragging === 'start') {
      setSelection({ ...selection, start: Math.min(position, selection.end - 0.01) })
    } else if (isDragging === 'end') {
      setSelection({ ...selection, end: Math.max(position, selection.start + 0.01) })
    }
  }

  const handleCanvasMouseUp = () => {
    setIsDragging(null)
  }

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (editMode) return // Don't seek when in edit mode
    
    const canvas = canvasRef.current
    if (!canvas) return
    
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const position = (x / zoom) + scrollPosition
    const newTime = position * duration
    
    setCurrentTime(newTime)
    if (isPlaying) {
      startPlayback(newTime)
    }
  }

  // Edit operations
  const applyTrim = async () => {
    if (!audioBuffer || !selection) return
    
    const startSample = Math.floor(selection.start * audioBuffer.length)
    const endSample = Math.floor(selection.end * audioBuffer.length)
    const newLength = endSample - startSample
    
    const newBuffer = audioContextRef.current!.createBuffer(
      audioBuffer.numberOfChannels,
      newLength,
      audioBuffer.sampleRate
    )
    
    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const oldData = audioBuffer.getChannelData(channel)
      const newData = newBuffer.getChannelData(channel)
      for (let i = 0; i < newLength; i++) {
        newData[i] = oldData[startSample + i]
      }
    }
    
    updateBuffer(newBuffer)
    setSelection(null)
    setEditMode(null)
    toast.success('Audio trimmed successfully')
  }

  const applyCut = async () => {
    if (!audioBuffer || !selection) return
    
    const startSample = Math.floor(selection.start * audioBuffer.length)
    const endSample = Math.floor(selection.end * audioBuffer.length)
    const cutLength = endSample - startSample
    const newLength = audioBuffer.length - cutLength
    
    const newBuffer = audioContextRef.current!.createBuffer(
      audioBuffer.numberOfChannels,
      newLength,
      audioBuffer.sampleRate
    )
    
    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const oldData = audioBuffer.getChannelData(channel)
      const newData = newBuffer.getChannelData(channel)
      
      // Copy before selection
      for (let i = 0; i < startSample; i++) {
        newData[i] = oldData[i]
      }
      
      // Copy after selection
      for (let i = endSample; i < audioBuffer.length; i++) {
        newData[i - cutLength] = oldData[i]
      }
    }
    
    updateBuffer(newBuffer)
    setSelection(null)
    setEditMode(null)
    toast.success('Section removed successfully')
  }

  const updateBuffer = (newBuffer: AudioBuffer) => {
    // Stop playback
    stopPlayback()
    
    // Update history
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push(newBuffer)
    setHistory(newHistory)
    setHistoryIndex(newHistory.length - 1)
    
    // Update state
    setAudioBuffer(newBuffer)
    setDuration(newBuffer.duration)
    setCurrentTime(0)
    generateWaveformData(newBuffer)
  }

  const undo = () => {
    if (historyIndex > 0) {
      stopPlayback()
      const prevBuffer = history[historyIndex - 1]
      setHistoryIndex(historyIndex - 1)
      setAudioBuffer(prevBuffer)
      setDuration(prevBuffer.duration)
      setCurrentTime(0)
      generateWaveformData(prevBuffer)
      setSelection(null)
      setEditMode(null)
      toast.info('Undo successful')
    }
  }

  const redo = () => {
    if (historyIndex < history.length - 1) {
      stopPlayback()
      const nextBuffer = history[historyIndex + 1]
      setHistoryIndex(historyIndex + 1)
      setAudioBuffer(nextBuffer)
      setDuration(nextBuffer.duration)
      setCurrentTime(0)
      generateWaveformData(nextBuffer)
      setSelection(null)
      setEditMode(null)
      toast.info('Redo successful')
    }
  }

  const handleSave = async () => {
    if (!audioBuffer || !onSave) return
    
    setIsSaving(true)
    try {
      // Encode audio buffer to WAV
      const wavBlob = encodeWAV(audioBuffer)
      const editedFileName = fileName.replace(/\.[^.]+$/, '_edited.wav')
      await onSave(wavBlob, editedFileName)
      toast.success('Audio saved successfully!')
    } catch (err) {
      console.error('Error saving audio:', err)
      toast.error('Failed to save audio')
    } finally {
      setIsSaving(false)
    }
  }

  // WAV encoder
  const encodeWAV = (buffer: AudioBuffer): Blob => {
    const numChannels = buffer.numberOfChannels
    const sampleRate = buffer.sampleRate
    const format = 1 // PCM
    const bitDepth = 16
    
    const bytesPerSample = bitDepth / 8
    const blockAlign = numChannels * bytesPerSample
    
    const samples = buffer.length
    const dataSize = samples * blockAlign
    const bufferSize = 44 + dataSize
    
    const arrayBuffer = new ArrayBuffer(bufferSize)
    const view = new DataView(arrayBuffer)
    
    // WAV header
    writeString(view, 0, 'RIFF')
    view.setUint32(4, bufferSize - 8, true)
    writeString(view, 8, 'WAVE')
    writeString(view, 12, 'fmt ')
    view.setUint32(16, 16, true) // fmt chunk size
    view.setUint16(20, format, true)
    view.setUint16(22, numChannels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * blockAlign, true)
    view.setUint16(32, blockAlign, true)
    view.setUint16(34, bitDepth, true)
    writeString(view, 36, 'data')
    view.setUint32(40, dataSize, true)
    
    // Audio data
    const channelData: Float32Array[] = []
    for (let ch = 0; ch < numChannels; ch++) {
      channelData.push(buffer.getChannelData(ch))
    }
    
    let offset = 44
    for (let i = 0; i < samples; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, channelData[ch][i]))
        const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF
        view.setInt16(offset, intSample, true)
        offset += 2
      }
    }
    
    return new Blob([arrayBuffer], { type: 'audio/wav' })
  }

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i))
    }
  }

  if (isLoading) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-8">
        <div className="flex flex-col items-center justify-center">
          <div className="w-12 h-12 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin mb-4" />
          <p className="text-slate-400">Loading audio for editing...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 bg-slate-900/50">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-white">Audio Editor</h3>
          <span className="text-sm text-slate-400">{formatTime(duration)}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Undo/Redo */}
          <button
            onClick={undo}
            disabled={historyIndex <= 0}
            className="p-2 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Undo"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>
          <button
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
            className="p-2 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Redo"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
            </svg>
          </button>
          
          <div className="w-px h-6 bg-slate-700 mx-1" />
          
          {/* Zoom controls */}
          <button
            onClick={() => setZoom(Math.max(1, zoom - 0.5))}
            disabled={zoom <= 1}
            className="p-2 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Zoom Out"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
            </svg>
          </button>
          <span className="text-xs text-slate-400 w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom(Math.min(4, zoom + 0.5))}
            disabled={zoom >= 4}
            className="p-2 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Zoom In"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Waveform Canvas */}
      <div 
        ref={containerRef}
        className="relative bg-slate-900 cursor-crosshair"
        style={{ height: '180px' }}
      >
        <canvas
          ref={canvasRef}
          width={800}
          height={180}
          className="w-full h-full"
          onClick={handleCanvasClick}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
        />
        
        {/* Current time display */}
        <div className="absolute top-2 left-2 px-2 py-1 bg-slate-800/80 rounded text-xs font-mono text-white">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
        
        {/* Selection info */}
        {selection && editMode && (
          <div className="absolute top-2 right-2 px-2 py-1 bg-slate-800/80 rounded text-xs font-mono text-white">
            Selection: {formatTime(selection.start * duration)} - {formatTime(selection.end * duration)}
            <span className="ml-2 text-slate-400">
              ({formatTime((selection.end - selection.start) * duration)})
            </span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="p-4 space-y-4">
        {/* Playback Controls */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => setCurrentTime(0)}
            className="p-2 text-slate-400 hover:text-white transition-colors"
            title="Go to start"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
            </svg>
          </button>
          
          <button
            onClick={() => setCurrentTime(Math.max(0, currentTime - 5))}
            className="p-2 text-slate-400 hover:text-white transition-colors"
            title="Back 5s"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/>
            </svg>
          </button>
          
          <button
            onClick={togglePlayback}
            className="w-14 h-14 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 flex items-center justify-center text-white shadow-lg shadow-amber-500/25 transition-all"
          >
            {isPlaying ? (
              <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
              </svg>
            ) : (
              <svg className="w-7 h-7 ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            )}
          </button>
          
          <button
            onClick={() => setCurrentTime(Math.min(duration, currentTime + 5))}
            className="p-2 text-slate-400 hover:text-white transition-colors"
            title="Forward 5s"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/>
            </svg>
          </button>
          
          <button
            onClick={() => setCurrentTime(duration)}
            className="p-2 text-slate-400 hover:text-white transition-colors"
            title="Go to end"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
            </svg>
          </button>
        </div>

        {/* Edit Mode Buttons */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => {
              setEditMode(editMode === 'trim' ? null : 'trim')
              setSelection(editMode === 'trim' ? null : { start: 0.1, end: 0.9 })
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              editMode === 'trim'
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
            </svg>
            Trim
          </button>
          
          <button
            onClick={() => {
              setEditMode(editMode === 'cut' ? null : 'cut')
              setSelection(editMode === 'cut' ? null : { start: 0.3, end: 0.5 })
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              editMode === 'cut'
                ? 'bg-red-500 text-white shadow-lg shadow-red-500/25'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
            </svg>
            Cut Section
          </button>
        </div>

        {/* Edit Actions */}
        {editMode && selection && (
          <div className="flex items-center justify-center gap-3 p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
            <div className="text-sm text-slate-400">
              {editMode === 'trim' ? (
                <>
                  <span className="text-emerald-400 font-medium">Keep</span> the selected portion
                </>
              ) : (
                <>
                  <span className="text-red-400 font-medium">Remove</span> the selected portion
                </>
              )}
            </div>
            <div className="flex gap-2 ml-4">
              <button
                onClick={() => {
                  setSelection(null)
                  setEditMode(null)
                }}
                className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={editMode === 'trim' ? applyTrim : applyCut}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
                  editMode === 'trim'
                    ? 'bg-emerald-500 hover:bg-emerald-600'
                    : 'bg-red-500 hover:bg-red-600'
                }`}
              >
                Apply {editMode === 'trim' ? 'Trim' : 'Cut'}
              </button>
            </div>
          </div>
        )}

        {/* Tips */}
        {!editMode && (
          <p className="text-center text-sm text-slate-500">
            Click on the waveform to seek • Select <strong>Trim</strong> to keep a portion • Select <strong>Cut</strong> to remove a portion
          </p>
        )}
        {editMode && (
          <p className="text-center text-sm text-slate-500">
            Drag the handles to adjust selection • Click <strong>Apply</strong> when ready
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50 bg-slate-900/50">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
        >
          Cancel Editing
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving || historyIndex === 0}
          className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 rounded-lg shadow-lg shadow-amber-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Saving...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              Save Changes
            </>
          )}
        </button>
      </div>
    </div>
  )
}

