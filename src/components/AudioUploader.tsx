'use client'

import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { Recording, RecordingInsert } from '@/types/database'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'

interface UploadProgress {
  loaded: number
  total: number
  percentage: number
}

interface CompressionState {
  isCompressing: boolean
  progress: number
  message: string
  originalSize: number
  estimatedSize: number
}

// Thresholds for compression
const COMPRESSION_REQUIRED_THRESHOLD = 200 * 1024 * 1024 // 200MB - compression required
const COMPRESSION_SUGGEST_THRESHOLD = 50 * 1024 * 1024 // 50MB - suggest compression

export default function AudioUploader({
  onUploadComplete,
}: {
  onUploadComplete?: (recording: Recording) => void
}) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploadedRecording, setUploadedRecording] = useState<Recording | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const xhrRef = useRef<XMLHttpRequest | null>(null)
  const recordingIdRef = useRef<string | null>(null)
  
  // Compression state
  const [showCompressionModal, setShowCompressionModal] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [compressionRequired, setCompressionRequired] = useState(false)
  const [compression, setCompression] = useState<CompressionState>({
    isCompressing: false,
    progress: 0,
    message: '',
    originalSize: 0,
    estimatedSize: 0,
  })
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false)
  const ffmpegRef = useRef<FFmpeg | null>(null)
  const [mounted, setMounted] = useState(false)
  
  const toast = useToast()
  
  // Track if component is mounted for portal
  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])
  
  const supabase = useMemo(() => {
    try {
      return createClient()
    } catch {
      return null
    }
  }, [])

  // Load FFmpeg on mount
  useEffect(() => {
    const loadFFmpeg = async () => {
      if (ffmpegRef.current && ffmpegLoaded) return
      
      try {
        const ffmpeg = new FFmpeg()
        ffmpegRef.current = ffmpeg
        
        // Use standard single-threaded version (more compatible)
        // Note: WebM/Opus files may not be supported in basic build
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'
        await ffmpeg.load({
          coreURL: `${baseURL}/ffmpeg-core.js`,
          wasmURL: `${baseURL}/ffmpeg-core.wasm`,
        })
        
        setFfmpegLoaded(true)
        console.log('FFmpeg loaded successfully')
      } catch (err) {
        console.error('Failed to load FFmpeg:', err)
        // Try with default configuration
        try {
          const ffmpeg = new FFmpeg()
          ffmpegRef.current = ffmpeg
          await ffmpeg.load()
          setFfmpegLoaded(true)
          console.log('FFmpeg loaded with default config')
        } catch (err2) {
          console.error('FFmpeg default load also failed:', err2)
        }
      }
    }
    
    loadFFmpeg()
  }, [])

  const ALLOWED_TYPES = [
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/wave',
    'audio/x-wav',
    'audio/ogg',
    'audio/flac',
    'audio/m4a',
    'audio/mp4',
    'audio/x-m4a',
    'audio/aac',
    'audio/webm',
  ]

  const MAX_FILE_SIZE = 1000 * 1024 * 1024 // 1GB - suitable for long audio files

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type) && !file.name.match(/\.(mp3|wav|ogg|flac|m4a|aac|webm)$/i)) {
      return 'Please upload a valid audio file (MP3, WAV, OGG, FLAC, M4A, AAC, or WebM)'
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File is too large. Maximum size is ${formatFileSize(MAX_FILE_SIZE)}`
    }
    return null
  }

  // Target max size after compression (25MB to fit in 512MB RAM on backend)
  // 25MB file → ~75MB in memory (base64 + processing) → safe with ~150MB baseline
  const TARGET_COMPRESSED_SIZE = 25 * 1024 * 1024 // 25MB
  
  // Estimate duration from file size (rough: 1MB ≈ 1 minute for typical audio)
  const estimateDurationSeconds = (fileSize: number): number => {
    // Most audio formats: ~1MB per minute on average
    return (fileSize / (1024 * 1024)) * 60
  }
  
  // Calculate optimal bitrate to achieve target size
  const calculateOptimalBitrate = (fileSizeBytes: number): { bitrate: string; sampleRate: string } => {
    const estimatedDuration = estimateDurationSeconds(fileSizeBytes)
    // Target bits = targetSize * 8, then divide by duration
    const targetBits = TARGET_COMPRESSED_SIZE * 8
    const optimalBitrate = Math.floor(targetBits / estimatedDuration)
    
    // Clamp bitrate between 16k (minimum for understandable speech) and 48k (good quality)
    // Lower bitrates for long files to ensure they fit in 25MB target
    let bitrate: number
    let sampleRate: string
    
    if (optimalBitrate >= 48000) {
      bitrate = 48
      sampleRate = '16000'
    } else if (optimalBitrate >= 32000) {
      bitrate = 32
      sampleRate = '16000'
    } else if (optimalBitrate >= 24000) {
      bitrate = 24
      sampleRate = '12000'
    } else {
      // Very long files (4+ hours) - use minimum quality
      bitrate = 16
      sampleRate = '8000' // Telephone quality, but still understandable
    }
    
    console.log(`File: ${formatFileSize(fileSizeBytes)}, Est. duration: ${Math.round(estimatedDuration/60)}min, Optimal bitrate: ${bitrate}k`)
    return { bitrate: `${bitrate}k`, sampleRate }
  }

  // Estimate compressed size based on calculated bitrate
  const estimateCompressedSize = (originalSize: number): number => {
    const { bitrate } = calculateOptimalBitrate(originalSize)
    const bitrateNum = parseInt(bitrate) * 1000 // Convert "32k" to 32000
    const durationSec = estimateDurationSeconds(originalSize)
    // Compressed size = bitrate (bits/sec) * duration (sec) / 8 (bits to bytes)
    return Math.round((bitrateNum * durationSec) / 8)
  }

  // Compress audio file using FFmpeg (with browser conversion for WebM/OGG)
  const compressAudio = async (file: File): Promise<File> => {
    let fileToCompress = file
    
    // For WebM/OGG/Opus - first convert using browser's Web Audio API
    if (needsBrowserConversion(file.name)) {
      console.log('File needs browser conversion first:', file.name)
      try {
        fileToCompress = await convertWithWebAudio(file)
        toast.info('Converted to WAV, now compressing...')
      } catch (err) {
        console.error('Browser conversion failed:', err)
        throw new Error(`Cannot process this audio format: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }
    
    if (!ffmpegRef.current || !ffmpegLoaded) {
      throw new Error('FFmpeg not loaded. Please refresh the page and try again.')
    }
    
    const ffmpeg = ffmpegRef.current
    
    setCompression({
      isCompressing: true,
      progress: 0,
      message: 'Loading audio file...',
      originalSize: file.size, // Show original size
      estimatedSize: estimateCompressedSize(file.size),
    })
    
    try {
      // Get file extension - handle various formats
      const inputExt = fileToCompress.name.split('.').pop()?.toLowerCase() || 'mp3'
      const inputFileName = `input.${inputExt}`
      const outputFileName = 'output.mp3'
      
      console.log(`Compressing: ${fileToCompress.name} (${formatFileSize(fileToCompress.size)}) - format: ${inputExt}`)
      
      // Write input file
      setCompression(prev => ({ ...prev, progress: 5, message: 'Loading file into memory...' }))
      const fileData = await fetchFile(fileToCompress)
      
      setCompression(prev => ({ ...prev, progress: 10, message: 'Preparing audio...' }))
      await ffmpeg.writeFile(inputFileName, fileData)
      
      // Set up progress tracking
      ffmpeg.on('progress', ({ progress }) => {
        const percent = Math.min(90, Math.round(progress * 80) + 10) // 10-90%
        setCompression(prev => ({ 
          ...prev, 
          progress: percent, 
          message: `Compressing... ${percent}%` 
        }))
      })
      
      // Set up log tracking for debugging
      ffmpeg.on('log', ({ message }) => {
        console.log('FFmpeg:', message)
      })
      
      // Calculate optimal bitrate for target ~40MB output
      const { bitrate, sampleRate } = calculateOptimalBitrate(file.size)
      
      // Compress: mono, dynamic bitrate - optimized for speech + target size
      // Use -vn to ignore video streams (for webm files that might have video)
      setCompression(prev => ({ ...prev, progress: 15, message: `Compressing at ${bitrate}bps...` }))
      
      console.log(`Compression settings: bitrate=${bitrate}, sampleRate=${sampleRate}`)
      
      // Try different compression approaches based on input format
      let execResult: number
      
      if (inputExt === 'webm' || inputExt === 'ogg') {
        // For WebM/OGG, first try to extract audio, then compress
        console.log('Trying WebM/OGG conversion...')
        execResult = await ffmpeg.exec([
          '-i', inputFileName,
          '-vn',             // No video
          '-acodec', 'libmp3lame',  // Use MP3 encoder
          '-ac', '1',        // Mono
          '-ar', sampleRate, // Dynamic sample rate
          '-b:a', bitrate,   // Dynamic bitrate
          '-y',
          outputFileName
        ])
        
        // If that fails, try simpler approach
        if (execResult !== 0) {
          console.log('First attempt failed, trying simpler conversion...')
          execResult = await ffmpeg.exec([
            '-i', inputFileName,
            '-vn',
            '-ac', '1',
            '-ar', sampleRate,
            '-b:a', bitrate,
            '-y',
            outputFileName
          ])
        }
      } else {
        // Standard approach for other formats
        execResult = await ffmpeg.exec([
          '-i', inputFileName,
          '-vn',             // Ignore video stream
          '-ac', '1',        // Mono
          '-ar', sampleRate, // Dynamic sample rate
          '-b:a', bitrate,   // Dynamic bitrate
          '-y',              // Overwrite output
          outputFileName
        ])
      }
      
      console.log('FFmpeg exec result:', execResult)
      
      if (execResult !== 0) {
        console.error('FFmpeg returned non-zero exit code:', execResult)
        // Try one more time with minimal options
        console.log('Trying minimal conversion...')
        execResult = await ffmpeg.exec([
          '-i', inputFileName,
          '-y',
          outputFileName
        ])
        if (execResult !== 0) {
          throw new Error(`FFmpeg failed with exit code ${execResult}`)
        }
      }
      
      // Check if output file exists
      setCompression(prev => ({ ...prev, progress: 92, message: 'Reading compressed file...' }))
      
      let data: Uint8Array
      try {
        const fileContent = await ffmpeg.readFile(outputFileName)
        // Handle both string and Uint8Array returns
        if (typeof fileContent === 'string') {
          const encoder = new TextEncoder()
          data = encoder.encode(fileContent)
        } else {
          data = fileContent
        }
      } catch (readErr) {
        console.error('Failed to read output file:', readErr)
        throw new Error('Compression failed - output file not created')
      }
      
      if (data.length === 0) {
        throw new Error('Compression produced empty file')
      }
      
      // Clean up
      setCompression(prev => ({ ...prev, progress: 95, message: 'Cleaning up...' }))
      try {
        await ffmpeg.deleteFile(inputFileName)
        await ffmpeg.deleteFile(outputFileName)
      } catch {
        // Ignore cleanup errors
      }
      
      // Create new file with compressed data
      // Use spread to create a new regular array from Uint8Array
      const compressedBlob = new Blob([new Uint8Array(data)], { type: 'audio/mpeg' })
      const compressedFileName = file.name.replace(/\.[^.]+$/, '_compressed.mp3')
      const compressedFile = new File([compressedBlob], compressedFileName, { type: 'audio/mpeg' })
      
      console.log(`Compression complete: ${formatFileSize(file.size)} -> ${formatFileSize(compressedFile.size)}`)
      
      setCompression(prev => ({ ...prev, progress: 100, message: 'Compression complete!' }))
      
      toast.success(`Compressed from ${formatFileSize(file.size)} to ${formatFileSize(compressedFile.size)}`)
      
      return compressedFile
      
    } catch (err) {
      console.error('Compression error:', err)
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      throw new Error(`Failed to compress audio: ${errorMessage}`)
    } finally {
      setCompression(prev => ({ ...prev, isCompressing: false }))
      // Remove event listeners
      ffmpeg.off('progress', () => {})
      ffmpeg.off('log', () => {})
    }
  }

  // Extract audio duration from file
  const getAudioDuration = (file: File): Promise<number | null> => {
    return new Promise((resolve) => {
      const audio = new Audio()
      audio.preload = 'metadata'
      
      audio.onloadedmetadata = () => {
        URL.revokeObjectURL(audio.src)
        // Duration in seconds
        const duration = Math.round(audio.duration)
        resolve(isNaN(duration) || !isFinite(duration) ? null : duration)
      }
      
      audio.onerror = () => {
        URL.revokeObjectURL(audio.src)
        resolve(null)
      }
      
      audio.src = URL.createObjectURL(file)
    })
  }

  const cancelUpload = async () => {
    if (xhrRef.current) {
      xhrRef.current.abort()
      xhrRef.current = null
    }

    // Clean up the recording entry if it was created
    if (recordingIdRef.current && supabase) {
      await supabase
        .from('recordings')
        .delete()
        .eq('id', recordingIdRef.current)
      recordingIdRef.current = null
    }

    setUploading(false)
    setProgress(null)
    setFileName('')
    toast.info('Upload cancelled')
  }

  const uploadFile = async (file: File) => {
    if (!supabase) {
      setError('Supabase is not configured. Please set up environment variables.')
      return
    }
    
    setUploading(true)
    setError(null)
    setFileName(file.name)
    setProgress({ loaded: 0, total: file.size, percentage: 0 })

    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        throw new Error('Please sign in to upload files')
      }

      // Extract audio duration
      const duration = await getAudioDuration(file)
      console.log(`Audio duration: ${duration ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}` : 'unknown'}`)

      // Create unique file path
      const timestamp = Date.now()
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
      const filePath = `${user.id}/${timestamp}-${sanitizedName}`

      // 1. Create recording entry in database with 'uploading' status
      const recordingInsert: RecordingInsert = {
        user_id: user.id,
        file_path: filePath,
        file_name: file.name,
        file_size: file.size,
        duration: duration, // Save duration!
        status: 'uploading',
      }

      const { data: newRecording, error: insertError } = await supabase
        .from('recordings')
        .insert(recordingInsert)
        .select()
        .single()

      if (insertError) {
        throw new Error(`Failed to create recording: ${insertError.message}`)
      }

      recordingIdRef.current = newRecording.id

      // 2. Upload file to storage with progress tracking
      const { data: { session } } = await supabase.auth.getSession()
      
      const xhr = new XMLHttpRequest()
      xhrRef.current = xhr
      
      const uploadPromise = new Promise<void>((resolve, reject) => {
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percentage = Math.round((event.loaded / event.total) * 100)
            setProgress({
              loaded: event.loaded,
              total: event.total,
              percentage,
            })
          }
        })

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve()
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`))
          }
        })

        xhr.addEventListener('error', () => {
          reject(new Error('Upload failed. Please try again.'))
        })

        xhr.addEventListener('abort', () => {
          reject(new Error('Upload cancelled'))
        })

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        xhr.open('POST', `${supabaseUrl}/storage/v1/object/audio-files/${filePath}`)
        xhr.setRequestHeader('Authorization', `Bearer ${session?.access_token}`)
        xhr.setRequestHeader('x-upsert', 'true')
        xhr.send(file)
      })

      await uploadPromise

      // 3. Update recording status to 'done'
      const { data: updatedRecording, error: updateError } = await supabase
        .from('recordings')
        .update({ status: 'done' })
        .eq('id', recordingIdRef.current)
        .select()
        .single()

      if (updateError) {
        throw new Error(`Failed to update recording status: ${updateError.message}`)
      }

      xhrRef.current = null
      recordingIdRef.current = null
      setUploadedRecording(updatedRecording)
      onUploadComplete?.(updatedRecording)
      
    } catch (err) {
      // If we created a recording but upload failed, update status to 'error'
      if (recordingIdRef.current && supabase && (err as Error).message !== 'Upload cancelled') {
        await supabase
          .from('recordings')
          .update({ status: 'error' })
          .eq('id', recordingIdRef.current)
      }
      
      if ((err as Error).message !== 'Upload cancelled') {
        setError(err instanceof Error ? err.message : 'Upload failed. Please try again.')
        toast.error('Upload failed')
      }
      
      xhrRef.current = null
      recordingIdRef.current = null
    } finally {
      setUploading(false)
      setProgress(null)
      setFileName('')
    }
  }

  // Max size for browser-based conversion (100 MB - larger files will timeout/crash)
  const MAX_BROWSER_CONVERSION_SIZE = 100 * 1024 * 1024 // 100 MB

  // Check if file needs browser-based conversion first (WebM/OGG/Opus)
  const needsBrowserConversion = (fileName: string): boolean => {
    const ext = fileName.split('.').pop()?.toLowerCase() || ''
    const browserOnlyFormats = ['webm', 'ogg', 'opus']
    return browserOnlyFormats.includes(ext)
  }

  // Check if file can be converted (format needs conversion AND size is manageable)
  const canBeConverted = (file: File): boolean => {
    if (!needsBrowserConversion(file.name)) return true // FFmpeg can handle directly
    return file.size <= MAX_BROWSER_CONVERSION_SIZE // Browser can only handle smaller files
  }

  // Convert audio file using Web Audio API (for formats FFmpeg can't decode)
  const convertWithWebAudio = async (file: File): Promise<File> => {
    setCompression(prev => ({ 
      ...prev, 
      isCompressing: true, 
      progress: 5, 
      message: 'Decoding audio with browser...',
      originalSize: file.size,
      estimatedSize: estimateCompressedSize(file.size),
    }))

    try {
      // Create AudioContext
      const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      
      // Read file as ArrayBuffer
      setCompression(prev => ({ ...prev, progress: 10, message: 'Reading file...' }))
      const arrayBuffer = await file.arrayBuffer()
      
      // Decode audio data
      setCompression(prev => ({ ...prev, progress: 20, message: 'Decoding audio...' }))
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
      
      // Convert to mono and downsample for speech
      setCompression(prev => ({ ...prev, progress: 40, message: 'Processing audio...' }))
      const targetSampleRate = 16000 // 16kHz for speech
      const numChannels = 1 // Mono
      
      // Create offline context for resampling
      const offlineContext = new OfflineAudioContext(
        numChannels,
        Math.ceil(audioBuffer.duration * targetSampleRate),
        targetSampleRate
      )
      
      // Create buffer source
      const source = offlineContext.createBufferSource()
      source.buffer = audioBuffer
      source.connect(offlineContext.destination)
      source.start(0)
      
      // Render
      setCompression(prev => ({ ...prev, progress: 60, message: 'Resampling audio...' }))
      const renderedBuffer = await offlineContext.startRendering()
      
      // Convert to WAV
      setCompression(prev => ({ ...prev, progress: 80, message: 'Creating WAV file...' }))
      const wavBlob = audioBufferToWav(renderedBuffer)
      
      // Clean up
      await audioContext.close()
      
      const wavFileName = file.name.replace(/\.[^.]+$/, '.wav')
      const wavFile = new File([wavBlob], wavFileName, { type: 'audio/wav' })
      
      console.log(`Converted ${file.name} (${formatFileSize(file.size)}) to WAV (${formatFileSize(wavFile.size)})`)
      
      setCompression(prev => ({ ...prev, progress: 90, message: 'WAV conversion complete!' }))
      
      return wavFile
    } catch (err) {
      console.error('Web Audio conversion failed:', err)
      throw new Error(`Failed to convert audio: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  // Convert AudioBuffer to WAV Blob
  const audioBufferToWav = (buffer: AudioBuffer): Blob => {
    const numChannels = buffer.numberOfChannels
    const sampleRate = buffer.sampleRate
    const format = 1 // PCM
    const bitDepth = 16
    
    const bytesPerSample = bitDepth / 8
    const blockAlign = numChannels * bytesPerSample
    
    const samples = buffer.getChannelData(0) // Get mono channel
    const dataLength = samples.length * bytesPerSample
    const bufferLength = 44 + dataLength
    
    const arrayBuffer = new ArrayBuffer(bufferLength)
    const view = new DataView(arrayBuffer)
    
    // WAV header
    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i))
      }
    }
    
    writeString(0, 'RIFF')
    view.setUint32(4, 36 + dataLength, true)
    writeString(8, 'WAVE')
    writeString(12, 'fmt ')
    view.setUint32(16, 16, true) // Subchunk1Size
    view.setUint16(20, format, true)
    view.setUint16(22, numChannels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * blockAlign, true)
    view.setUint16(32, blockAlign, true)
    view.setUint16(34, bitDepth, true)
    writeString(36, 'data')
    view.setUint32(40, dataLength, true)
    
    // Write samples
    let offset = 44
    for (let i = 0; i < samples.length; i++) {
      const sample = Math.max(-1, Math.min(1, samples[i]))
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF
      view.setInt16(offset, intSample, true)
      offset += 2
    }
    
    return new Blob([arrayBuffer], { type: 'audio/wav' })
  }

  // Handle file selection - check if compression is needed
  const handleFileSelection = async (file: File) => {
    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      toast.error(validationError)
      return
    }

    // Check if file can be compressed
    if (!canBeConverted(file)) {
      // Large WebM/OGG file - can't compress, upload directly
      const ext = file.name.split('.').pop()?.toLowerCase()
      toast.warning(`${ext?.toUpperCase()} files over 100 MB cannot be compressed. Uploading original (${formatFileSize(file.size)})...`)
      await uploadFile(file)
      return
    }

    // Check if compression is needed/suggested
    if (file.size >= COMPRESSION_REQUIRED_THRESHOLD) {
      // Large file - compression required
      // Wait for FFmpeg to load if not ready
      if (!ffmpegLoaded && ffmpegRef.current) {
        toast.info('Preparing compressor, please wait...')
      }
      setPendingFile(file)
      setCompressionRequired(true)
      setShowCompressionModal(true)
    } else if (file.size >= COMPRESSION_SUGGEST_THRESHOLD) {
      // Medium file - suggest compression (only if FFmpeg is available)
      if (ffmpegLoaded) {
        setPendingFile(file)
        setCompressionRequired(false)
        setShowCompressionModal(true)
      } else {
        // FFmpeg not loaded, upload directly
        await uploadFile(file)
      }
    } else {
      // Small file - upload directly
      await uploadFile(file)
    }
  }

  // Handle compression modal actions
  const handleCompressAndUpload = async () => {
    if (!pendingFile) return
    
    setShowCompressionModal(false)
    
    try {
      const compressedFile = await compressAudio(pendingFile)
      await uploadFile(compressedFile)
    } catch (err) {
      console.error('Compression failed:', err)
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      
      // Ask user if they want to upload original instead
      if (confirm(`Compression failed: ${errorMessage}\n\nWould you like to upload the original file instead?`)) {
        toast.info('Uploading original file...')
        await uploadFile(pendingFile)
      } else {
        setError(`Compression failed: ${errorMessage}`)
        toast.error('Compression failed')
      }
    } finally {
      setPendingFile(null)
    }
  }

  const handleUploadOriginal = async () => {
    if (!pendingFile || compressionRequired) return
    
    setShowCompressionModal(false)
    await uploadFile(pendingFile)
    setPendingFile(null)
  }

  const handleCancelCompression = () => {
    setShowCompressionModal(false)
    setPendingFile(null)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return

    await handleFileSelection(files[0])
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    await handleFileSelection(files[0])
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const resetUploader = () => {
    setUploadedRecording(null)
    setError(null)
    setProgress(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Compression Modal
  const CompressionModal = () => {
    if (!showCompressionModal || !pendingFile) return null
    
    const estimatedSize = estimateCompressedSize(pendingFile.size)
    const savingsPercent = Math.round((1 - estimatedSize / pendingFile.size) * 100)
    
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-md w-full p-6 animate-scale-in my-8">
          {/* Header */}
          <div className="flex items-start gap-3 mb-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
              compressionRequired ? 'bg-amber-500/20' : 'bg-blue-500/20'
            }`}>
              <svg className={`w-6 h-6 ${compressionRequired ? 'text-amber-400' : 'text-blue-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-white">
                {compressionRequired ? '⚠️ Large File Detected' : '💡 Compress for Faster Upload?'}
              </h3>
              <p className="text-slate-400 text-sm">
                {compressionRequired 
                  ? 'This file must be compressed before upload'
                  : 'Compression is recommended for better performance'}
              </p>
            </div>
            {/* Close button */}
            <button
              onClick={handleCancelCompression}
              className="p-1 text-slate-400 hover:text-white transition-colors flex-shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* File Info */}
          <div className="bg-slate-900/50 rounded-xl p-4 mb-4">
            <p className="text-white font-medium truncate mb-3">{pendingFile.name}</p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-slate-500 mb-1">Original Size</p>
                <p className="text-white font-medium text-lg">{formatFileSize(pendingFile.size)}</p>
              </div>
              <div>
                <p className="text-slate-500 mb-1">After Compression</p>
                <p className="text-emerald-400 font-medium text-lg">~{formatFileSize(estimatedSize)}</p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-700">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-sm">Estimated savings</span>
                <span className="text-emerald-400 font-bold text-lg">{savingsPercent}% smaller</span>
              </div>
            </div>
          </div>
          
          {/* Info */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 mb-6">
            <p className="text-blue-300 text-sm">
              ℹ️ Compression optimizes audio for speech recognition. Quality remains excellent for transcription.
            </p>
          </div>
          
          {/* Loading FFmpeg indicator */}
          {!ffmpegLoaded && (
            <div className="flex items-center justify-center gap-2 mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <svg className="animate-spin w-5 h-5 text-amber-400" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-amber-300 text-sm">Loading compression engine...</span>
            </div>
          )}
          
          {/* Actions */}
          <div className="flex flex-col gap-2">
            <button
              onClick={handleCompressAndUpload}
              disabled={!ffmpegLoaded}
              className="w-full px-4 py-3 bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white font-medium rounded-xl shadow-lg shadow-emerald-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {ffmpegLoaded ? (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  🗜️ Compress & Upload
                </>
              ) : (
                <>
                  <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Loading compressor...
                </>
              )}
            </button>
            
            <button
              onClick={() => {
                setShowCompressionModal(false)
                uploadFile(pendingFile)
                setPendingFile(null)
              }}
              className={`w-full px-4 py-3 ${compressionRequired ? 'bg-amber-600 hover:bg-amber-500' : 'bg-slate-700 hover:bg-slate-600'} text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              {compressionRequired ? '⚠️ Upload Without Compression' : 'Upload Original'} ({formatFileSize(pendingFile.size)})
            </button>
            
            {compressionRequired && (
              <p className="text-amber-400/70 text-xs text-center">
                Warning: Large files may take longer to process
              </p>
            )}
            
            <button
              onClick={handleCancelCompression}
              className="w-full px-4 py-2 text-slate-400 hover:text-white transition-colors text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Compression Progress UI
  const CompressionProgress = () => {
    if (!compression.isCompressing) return null
    
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-md w-full p-6">
          <div className="text-center">
            <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-emerald-500/20 to-green-500/20 flex items-center justify-center mb-4">
              <svg className="w-10 h-10 text-emerald-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            
            <h3 className="text-lg font-semibold text-white mb-2">Compressing Audio</h3>
            <p className="text-slate-400 text-sm mb-6">{compression.message}</p>
            
            <div className="w-full mb-4">
              <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-green-500 transition-all duration-300"
                  style={{ width: `${compression.progress}%` }}
                />
              </div>
              <p className="text-emerald-400 text-sm mt-2 font-medium">{compression.progress}%</p>
            </div>
            
            <div className="flex items-center justify-center gap-4 text-sm">
              <div>
                <p className="text-slate-500">Original</p>
                <p className="text-white">{formatFileSize(compression.originalSize)}</p>
              </div>
              <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
              <div>
                <p className="text-slate-500">Target</p>
                <p className="text-emerald-400">~{formatFileSize(compression.estimatedSize)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (uploadedRecording) {
    return (
      <div className="w-full animate-fade-in">
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-white truncate">{uploadedRecording.file_name}</h3>
              <p className="text-slate-400 text-sm mt-1">
                {formatFileSize(uploadedRecording.file_size)} • Uploaded successfully
              </p>
            </div>
            <button
              onClick={resetUploader}
              className="flex-shrink-0 px-4 py-2 text-sm font-medium text-white bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors flex items-center gap-2"
              title="Upload another file"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Upload Another
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="w-full">
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => !uploading && !compression.isCompressing && fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300 ${
            isDragging
              ? 'border-amber-500 bg-amber-500/10'
              : uploading || compression.isCompressing
              ? 'border-slate-600 bg-slate-800/50 cursor-not-allowed'
              : 'border-slate-600 hover:border-amber-500/50 hover:bg-slate-800/50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac,.webm"
            onChange={handleFileSelect}
            className="hidden"
            disabled={uploading || compression.isCompressing}
          />

          {uploading && progress ? (
            <div className="space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/20 flex items-center justify-center animate-pulse-glow">
                <svg className="w-8 h-8 text-amber-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div>
                <p className="text-white font-medium">Uploading...</p>
                <p className="text-slate-400 text-sm mt-1 truncate max-w-xs mx-auto">
                  {fileName}
                </p>
                <p className="text-slate-500 text-xs mt-1">
                  {formatFileSize(progress.loaded)} / {formatFileSize(progress.total)}
                </p>
              </div>
              <div className="w-full max-w-xs mx-auto">
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-300"
                    style={{ width: `${progress.percentage}%` }}
                  />
                </div>
                <p className="text-amber-400 text-sm mt-2 font-medium">{progress.percentage}%</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  cancelUpload()
                }}
                className="px-4 py-2 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
              >
                Cancel Upload
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center transition-colors ${
                isDragging ? 'bg-amber-500/20' : 'bg-slate-700/50'
              }`}>
                <svg className={`w-8 h-8 transition-colors ${isDragging ? 'text-amber-400' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              </div>
              <div>
                <p className="text-white font-medium">
                  {isDragging ? 'Drop your audio file here' : 'Drag & drop your audio file'}
                </p>
                <p className="text-slate-400 text-sm mt-1">
                  or click to browse
                </p>
              </div>
              <div className="text-slate-500 text-xs space-y-1">
                <p>Supports: MP3, WAV, OGG, FLAC, M4A, AAC, WebM</p>
                <p>Max size: {formatFileSize(MAX_FILE_SIZE)}</p>
                {ffmpegLoaded && (
                  <p className="text-emerald-400">✓ Smart compression available for large files</p>
                )}
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl animate-fade-in">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-red-400 text-sm">{error}</p>
              <button
                onClick={() => setError(null)}
                className="ml-auto p-1 text-red-400 hover:text-red-300"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
      
      {/* Modals - rendered via portal to body */}
      {mounted && createPortal(<CompressionModal />, document.body)}
      {mounted && createPortal(<CompressionProgress />, document.body)}
    </>
  )
}
