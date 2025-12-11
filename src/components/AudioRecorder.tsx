'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { Recording } from '@/types/database'

interface AudioRecorderProps {
  onRecordingComplete?: (recording: Recording) => void
}

export default function AudioRecorder({ onRecordingComplete }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [permissionState, setPermissionState] = useState<'prompt' | 'granted' | 'denied'>('prompt')
  const [recordingName, setRecordingName] = useState('')
  const [audioLevel, setAudioLevel] = useState(0) // 0-1 scale for audio visualization
  const [frequencyBands, setFrequencyBands] = useState<number[]>(new Array(16).fill(0)) // For EQ visualization
  const [showSettings, setShowSettings] = useState(false)
  
  // Audio settings
  const [inputGain, setInputGain] = useState(1.0) // 0.0 - 2.0 range
  const [noiseSuppression, setNoiseSuppression] = useState(true)
  const [echoCancellation, setEchoCancellation] = useState(true)
  const [autoGainControl, setAutoGainControl] = useState(true)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  const toast = useToast()

  // Check microphone permission on mount
  useEffect(() => {
    checkPermission()
    return () => {
      stopTimer()
      stopAudioAnalysis()
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl)
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  // Audio level analysis functions
  const startAudioAnalysis = useCallback((stream: MediaStream) => {
    try {
      const audioContext = new AudioContext()
      const analyser = audioContext.createAnalyser()
      const gainNode = audioContext.createGain()
      const source = audioContext.createMediaStreamSource(stream)
      
      analyser.fftSize = 64 // Smaller for fewer bands but faster
      analyser.smoothingTimeConstant = 0.7
      
      // Connect: source -> gainNode -> analyser
      source.connect(gainNode)
      gainNode.connect(analyser)
      gainNode.gain.value = inputGain
      
      audioContextRef.current = audioContext
      analyserRef.current = analyser
      gainNodeRef.current = gainNode
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      
      const updateLevel = () => {
        if (!analyserRef.current) return
        
        analyserRef.current.getByteFrequencyData(dataArray)
        
        // Calculate average level
        const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length
        // Normalize to 0-1 range with some boost for better visualization
        const normalizedLevel = Math.min(1, (average / 128) * 1.5)
        
        setAudioLevel(normalizedLevel)
        
        // Update frequency bands for EQ visualization (16 bands)
        const bands: number[] = []
        const bandSize = Math.floor(dataArray.length / 16)
        for (let i = 0; i < 16; i++) {
          let sum = 0
          for (let j = 0; j < bandSize; j++) {
            sum += dataArray[i * bandSize + j]
          }
          bands.push(Math.min(1, (sum / bandSize / 255) * 1.5))
        }
        setFrequencyBands(bands)
        
        animationFrameRef.current = requestAnimationFrame(updateLevel)
      }
      
      updateLevel()
    } catch (err) {
      console.error('Error starting audio analysis:', err)
    }
  }, [inputGain])

  const stopAudioAnalysis = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    analyserRef.current = null
    gainNodeRef.current = null
    setAudioLevel(0)
    setFrequencyBands(new Array(16).fill(0))
  }, [])

  // Update gain when slider changes
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = inputGain
    }
  }, [inputGain])

  const checkPermission = async () => {
    try {
      const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName })
      setPermissionState(permission.state as 'prompt' | 'granted' | 'denied')
      permission.onchange = () => {
        setPermissionState(permission.state as 'prompt' | 'granted' | 'denied')
      }
    } catch {
      // Permission API not supported, will check when recording starts
    }
  }

  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      setRecordingTime(prev => prev + 1)
    }, 1000)
  }, [])

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const startRecording = async () => {
    try {
      // Request microphone access with user settings
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: echoCancellation,
          noiseSuppression: noiseSuppression,
          autoGainControl: autoGainControl,
        }
      })
      
      streamRef.current = stream
      setPermissionState('granted')

      // Determine best supported format
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4'

      const mediaRecorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType })
        setAudioBlob(blob)
        
        // Create URL for preview
        if (audioUrl) {
          URL.revokeObjectURL(audioUrl)
        }
        const url = URL.createObjectURL(blob)
        setAudioUrl(url)
        
        // Generate default name
        const now = new Date()
        const defaultName = `Recording ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`
        setRecordingName(defaultName)

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }

      mediaRecorder.start(1000) // Collect data every second
      setIsRecording(true)
      setIsPaused(false)
      setRecordingTime(0)
      setAudioBlob(null)
      setAudioUrl(null)
      startTimer()
      startAudioAnalysis(stream) // Start audio level visualization

    } catch (err) {
      console.error('Error accessing microphone:', err)
      if (err instanceof Error && err.name === 'NotAllowedError') {
        setPermissionState('denied')
        toast.error('Microphone access denied. Please allow microphone access in your browser settings.')
      } else {
        toast.error('Failed to access microphone. Please check your device.')
      }
    }
  }

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      if (isPaused) {
        mediaRecorderRef.current.resume()
        startTimer()
      } else {
        mediaRecorderRef.current.pause()
        stopTimer()
      }
      setIsPaused(!isPaused)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      setIsPaused(false)
      stopTimer()
      stopAudioAnalysis() // Stop audio level visualization
    }
  }

  const discardRecording = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
    }
    setAudioBlob(null)
    setAudioUrl(null)
    setRecordingTime(0)
    setRecordingName('')
    chunksRef.current = []
  }

  const uploadRecording = async () => {
    if (!audioBlob) return

    setIsUploading(true)
    setUploadProgress(0)

    try {
      const supabase = createClient()
      
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        throw new Error('Not authenticated')
      }

      // Determine file extension based on mime type
      const mimeType = audioBlob.type
      let extension = 'webm'
      if (mimeType.includes('mp4')) extension = 'm4a'
      else if (mimeType.includes('mp3') || mimeType.includes('mpeg')) extension = 'mp3'
      
      // Create file name
      const timestamp = Date.now()
      const safeName = recordingName.replace(/[^a-zA-Z0-9\s]/g, '').trim() || 'recording'
      const fileName = `${safeName.replace(/\s+/g, '_')}_${timestamp}.${extension}`
      const filePath = `${user.id}/${fileName}`

      setUploadProgress(20)

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('audio-files')
        .upload(filePath, audioBlob, {
          contentType: mimeType,
          cacheControl: '3600',
        })

      if (uploadError) throw uploadError

      setUploadProgress(60)

      // Create recording entry in database
      const { data: recording, error: dbError } = await supabase
        .from('recordings')
        .insert({
          user_id: user.id,
          file_path: filePath,
          file_name: recordingName || 'Untitled Recording',
          file_size: audioBlob.size,
          duration: recordingTime,
          status: 'done',
        })
        .select()
        .single()

      if (dbError) throw dbError

      setUploadProgress(100)

      toast.success('Recording uploaded successfully!')
      
      // Notify parent component
      if (onRecordingComplete && recording) {
        onRecordingComplete(recording)
      }

      // Reset state
      discardRecording()

    } catch (err) {
      console.error('Upload error:', err)
      toast.error('Failed to upload recording. Please try again.')
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
    }
  }

  // Render permission denied state
  if (permissionState === 'denied') {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 mx-auto rounded-full bg-red-500/20 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-white mb-2">Microphone Access Denied</h3>
        <p className="text-slate-400 text-sm max-w-sm mx-auto">
          Please allow microphone access in your browser settings to record audio.
        </p>
      </div>
    )
  }

  // Render preview state (after recording)
  if (audioBlob && audioUrl) {
    return (
      <div className="space-y-4">
        {/* Recording Preview */}
        <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500/30 to-green-500/30 flex items-center justify-center">
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-white font-medium">Recording Complete</p>
              <p className="text-slate-400 text-sm">{formatTime(recordingTime)} • {(audioBlob.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          </div>

          {/* Audio Player */}
          <audio controls className="w-full h-12 rounded-lg mb-4" src={audioUrl}>
            Your browser does not support the audio element.
          </audio>

          {/* Recording Name Input */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-300 mb-2">Recording Name</label>
            <input
              type="text"
              value={recordingName}
              onChange={(e) => setRecordingName(e.target.value)}
              placeholder="Enter recording name..."
              className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all"
            />
          </div>

          {/* Upload Progress */}
          {isUploading && (
            <div className="mb-4">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-slate-400">Uploading...</span>
                <span className="text-amber-400">{uploadProgress}%</span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={discardRecording}
              disabled={isUploading}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Discard
            </button>
            <button
              onClick={uploadRecording}
              disabled={isUploading || !recordingName.trim()}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 rounded-xl shadow-lg shadow-amber-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isUploading ? (
                <>
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Uploading...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Save Recording
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Render recording state
  return (
    <div className="space-y-4">
      {isRecording ? (
        /* Recording In Progress - Full Screen Style */
        <div className="relative rounded-xl overflow-hidden">
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-red-900/20 via-slate-900 to-rose-900/20" />
          
          {/* Content */}
          <div className="relative p-8 animate-pulse-border border border-red-500/30 rounded-xl">
            <div className="flex flex-col items-center">
              {/* Recording Indicator - Large with Dynamic Audio Visualization */}
              <div className="relative mb-6">
                {/* Dynamic outer rings - react to audio level */}
                {!isPaused && (
                  <>
                    {/* Outermost ring - largest reaction */}
                    <div 
                      className="absolute rounded-full border-2 border-red-500 transition-all duration-75"
                      style={{
                        inset: `${-30 - audioLevel * 40}px`,
                        opacity: 0.1 + audioLevel * 0.3,
                        borderWidth: `${2 + audioLevel * 2}px`,
                      }}
                    />
                    {/* Middle ring */}
                    <div 
                      className="absolute rounded-full border-2 border-red-500 transition-all duration-75"
                      style={{
                        inset: `${-20 - audioLevel * 25}px`,
                        opacity: 0.2 + audioLevel * 0.4,
                        borderWidth: `${2 + audioLevel * 1.5}px`,
                      }}
                    />
                    {/* Inner ring */}
                    <div 
                      className="absolute rounded-full border-2 border-red-500 transition-all duration-75"
                      style={{
                        inset: `${-10 - audioLevel * 15}px`,
                        opacity: 0.3 + audioLevel * 0.5,
                        borderWidth: `${2 + audioLevel}px`,
                      }}
                    />
                    {/* Glow effect based on audio level */}
                    <div 
                      className="absolute inset-[-5px] rounded-full bg-red-500 blur-xl transition-all duration-75"
                      style={{
                        opacity: 0.1 + audioLevel * 0.4,
                        transform: `scale(${1 + audioLevel * 0.5})`,
                      }}
                    />
                  </>
                )}
                
                {/* Main indicator - scales slightly with audio */}
                <div 
                  className={`w-28 h-28 rounded-full flex items-center justify-center transition-all duration-75 ${
                    isPaused 
                      ? 'bg-gradient-to-br from-amber-500/30 to-orange-500/30'
                      : 'bg-gradient-to-br from-red-500/30 to-rose-500/30'
                  }`}
                  style={!isPaused ? {
                    transform: `scale(${1 + audioLevel * 0.15})`,
                  } : undefined}
                >
                  <div 
                    className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-75 ${
                      isPaused
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                    }`}
                    style={!isPaused ? {
                      boxShadow: `0 0 ${20 + audioLevel * 40}px ${audioLevel * 20}px rgba(239, 68, 68, ${0.3 + audioLevel * 0.4})`,
                    } : undefined}
                  >
                    {isPaused ? (
                      <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                      </svg>
                    ) : (
                      <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                        <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                      </svg>
                    )}
                  </div>
                </div>

                {/* Audio level meter bar */}
                {!isPaused && (
                  <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-32 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 transition-all duration-75 rounded-full"
                      style={{ width: `${audioLevel * 100}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Status Badge */}
              <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium mb-4 mt-4 ${
                isPaused 
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-red-500/20 text-red-400'
              }`}>
                <span className={`w-2 h-2 rounded-full ${isPaused ? 'bg-amber-400' : 'bg-red-400 animate-pulse'}`} />
                {isPaused ? 'PAUSED' : 'RECORDING'}
              </div>

              {/* Timer */}
              <div className="text-6xl font-mono font-bold text-white mb-6 tracking-wider">
                {formatTime(recordingTime)}
              </div>

              {/* EQ Visualizer */}
              {!isPaused && (
                <div className="flex items-end justify-center gap-1 h-12 mb-6">
                  {frequencyBands.map((level, index) => (
                    <div
                      key={index}
                      className="w-2 rounded-t transition-all duration-75"
                      style={{
                        height: `${Math.max(4, level * 48)}px`,
                        background: `linear-gradient(to top, 
                          ${level > 0.7 ? '#ef4444' : level > 0.4 ? '#eab308' : '#22c55e'}, 
                          ${level > 0.7 ? '#f87171' : level > 0.4 ? '#facc15' : '#4ade80'})`,
                        opacity: 0.6 + level * 0.4,
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Settings Toggle */}
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all mb-4 ${
                  showSettings 
                    ? 'bg-slate-700 text-white' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                Audio Settings
                <svg className={`w-3 h-3 transition-transform ${showSettings ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Settings Panel */}
              {showSettings && (
                <div className="w-full max-w-sm bg-slate-800/80 backdrop-blur-sm rounded-xl border border-slate-700/50 p-4 mb-6 animate-fade-in">
                  {/* Input Gain */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        </svg>
                        Input Gain
                      </label>
                      <span className="text-xs font-mono text-slate-400">
                        {inputGain > 1 ? '+' : ''}{Math.round((inputGain - 1) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.1"
                      value={inputGain}
                      onChange={(e) => setInputGain(parseFloat(e.target.value))}
                      className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-red-500"
                    />
                    <div className="flex justify-between text-xs text-slate-500 mt-1">
                      <span>Quiet</span>
                      <span>Normal</span>
                      <span>Loud</span>
                    </div>
                  </div>

                  {/* Audio Processing Toggles */}
                  <div className="space-y-3 pt-3 border-t border-slate-700/50">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Audio Processing</p>
                    
                    {/* Noise Suppression */}
                    <label className="flex items-center justify-between cursor-pointer group">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                        <span className="text-sm text-slate-300">Noise Suppression</span>
                      </div>
                      <div 
                        onClick={() => !isRecording && setNoiseSuppression(!noiseSuppression)}
                        className={`relative w-10 h-5 rounded-full transition-all ${
                          noiseSuppression ? 'bg-emerald-500' : 'bg-slate-600'
                        } ${isRecording ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${
                          noiseSuppression ? 'left-5' : 'left-0.5'
                        }`} />
                      </div>
                    </label>

                    {/* Echo Cancellation */}
                    <label className="flex items-center justify-between cursor-pointer group">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                        </svg>
                        <span className="text-sm text-slate-300">Echo Cancellation</span>
                      </div>
                      <div 
                        onClick={() => !isRecording && setEchoCancellation(!echoCancellation)}
                        className={`relative w-10 h-5 rounded-full transition-all ${
                          echoCancellation ? 'bg-emerald-500' : 'bg-slate-600'
                        } ${isRecording ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${
                          echoCancellation ? 'left-5' : 'left-0.5'
                        }`} />
                      </div>
                    </label>

                    {/* Auto Gain Control */}
                    <label className="flex items-center justify-between cursor-pointer group">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <span className="text-sm text-slate-300">Auto Gain Control</span>
                      </div>
                      <div 
                        onClick={() => !isRecording && setAutoGainControl(!autoGainControl)}
                        className={`relative w-10 h-5 rounded-full transition-all ${
                          autoGainControl ? 'bg-emerald-500' : 'bg-slate-600'
                        } ${isRecording ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${
                          autoGainControl ? 'left-5' : 'left-0.5'
                        }`} />
                      </div>
                    </label>
                  </div>

                  {isRecording && (
                    <p className="text-xs text-slate-500 mt-3 text-center">
                      ⚠️ Toggles will apply on next recording
                    </p>
                  )}
                </div>
              )}

              {/* Recording Controls */}
              <div className="flex items-center gap-6">
                {/* Pause/Resume Button */}
                <button
                  onClick={pauseRecording}
                  className={`group relative w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                    isPaused 
                      ? 'bg-emerald-500 hover:bg-emerald-400 shadow-lg shadow-emerald-500/30'
                      : 'bg-slate-700 hover:bg-slate-600'
                  }`}
                  title={isPaused ? 'Resume' : 'Pause'}
                >
                  {isPaused ? (
                    <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  ) : (
                    <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                    </svg>
                  )}
                </button>
                
                {/* Stop Button - Larger & More Prominent */}
                <button
                  onClick={stopRecording}
                  className="group relative w-20 h-20 rounded-full bg-white hover:bg-slate-100 flex items-center justify-center transition-all shadow-xl"
                  title="Stop & Save"
                >
                  <svg className="w-10 h-10 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                </button>
              </div>

              {/* Hint */}
              <p className="text-slate-500 text-sm mt-6">
                Click the white button to stop and save your recording
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* Start Recording Button - Large & Prominent */
        <div className="flex flex-col items-center py-8">
          {/* Big Record Button */}
          <button
            onClick={startRecording}
            className="group relative mb-6"
          >
            {/* Outer glow ring */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-red-500/30 to-rose-500/30 blur-xl group-hover:from-red-500/50 group-hover:to-rose-500/50 transition-all duration-300 scale-110" />
            
            {/* Button */}
            <div className="relative w-32 h-32 rounded-full bg-gradient-to-br from-red-500 to-rose-600 hover:from-red-400 hover:to-rose-500 flex items-center justify-center shadow-2xl shadow-red-500/40 hover:shadow-red-500/60 transition-all duration-300 hover:scale-105">
              <svg className="w-14 h-14 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
            </div>
          </button>
          
          <h3 className="text-xl font-semibold text-white mb-2">Tap to Record</h3>
          <p className="text-slate-400 text-sm text-center max-w-xs">
            Start recording your sales call, inspection, or meeting
          </p>
          
          {/* Tips */}
          <div className="flex items-center gap-6 mt-6 text-xs text-slate-500">
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Up to 3 hours
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Secure storage
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              High quality
            </div>
          </div>

          {/* Pre-recording Settings */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`flex items-center gap-2 px-4 py-2 mt-6 rounded-xl text-sm font-medium transition-all ${
              showSettings 
                ? 'bg-slate-700 text-white' 
                : 'text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            Audio Settings
            <svg className={`w-3 h-3 transition-transform ${showSettings ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Settings Panel (Pre-recording) */}
          {showSettings && (
            <div className="w-full max-w-sm bg-slate-800/80 backdrop-blur-sm rounded-xl border border-slate-700/50 p-4 mt-4 animate-fade-in">
              {/* Input Gain */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    </svg>
                    Input Gain
                  </label>
                  <span className="text-xs font-mono text-slate-400">
                    {inputGain > 1 ? '+' : ''}{Math.round((inputGain - 1) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={inputGain}
                  onChange={(e) => setInputGain(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-red-500"
                />
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>Quiet</span>
                  <span>Normal</span>
                  <span>Loud</span>
                </div>
              </div>

              {/* Audio Processing Toggles */}
              <div className="space-y-3 pt-3 border-t border-slate-700/50">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Audio Processing</p>
                
                {/* Noise Suppression */}
                <label className="flex items-center justify-between cursor-pointer group">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                    <span className="text-sm text-slate-300">Noise Suppression</span>
                  </div>
                  <div 
                    onClick={() => setNoiseSuppression(!noiseSuppression)}
                    className={`relative w-10 h-5 rounded-full transition-all cursor-pointer ${
                      noiseSuppression ? 'bg-emerald-500' : 'bg-slate-600'
                    }`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${
                      noiseSuppression ? 'left-5' : 'left-0.5'
                    }`} />
                  </div>
                </label>

                {/* Echo Cancellation */}
                <label className="flex items-center justify-between cursor-pointer group">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                    <span className="text-sm text-slate-300">Echo Cancellation</span>
                  </div>
                  <div 
                    onClick={() => setEchoCancellation(!echoCancellation)}
                    className={`relative w-10 h-5 rounded-full transition-all cursor-pointer ${
                      echoCancellation ? 'bg-emerald-500' : 'bg-slate-600'
                    }`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${
                      echoCancellation ? 'left-5' : 'left-0.5'
                    }`} />
                  </div>
                </label>

                {/* Auto Gain Control */}
                <label className="flex items-center justify-between cursor-pointer group">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span className="text-sm text-slate-300">Auto Gain Control</span>
                  </div>
                  <div 
                    onClick={() => setAutoGainControl(!autoGainControl)}
                    className={`relative w-10 h-5 rounded-full transition-all cursor-pointer ${
                      autoGainControl ? 'bg-emerald-500' : 'bg-slate-600'
                    }`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${
                      autoGainControl ? 'left-5' : 'left-0.5'
                    }`} />
                  </div>
                </label>
              </div>

              <p className="text-xs text-slate-500 mt-3 text-center">
                ✨ Settings apply when you start recording
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

