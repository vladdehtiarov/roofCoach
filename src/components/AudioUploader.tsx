'use client'

import { useState, useCallback, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { Recording, RecordingInsert } from '@/types/database'

interface UploadProgress {
  loaded: number
  total: number
  percentage: number
}

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
  const toast = useToast()
  
  const supabase = useMemo(() => {
    try {
      return createClient()
    } catch {
      return null
    }
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

  const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB - suitable for 3-hour audio files

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

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return

    const file = files[0]
    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      toast.error(validationError)
      return
    }

    await uploadFile(file)
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const file = files[0]
    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      toast.error(validationError)
      return
    }

    await uploadFile(file)
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
    <div className="w-full">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300 ${
          isDragging
            ? 'border-amber-500 bg-amber-500/10'
            : uploading
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
          disabled={uploading}
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
            <div className="text-slate-500 text-xs">
              <p>Supports: MP3, WAV, OGG, FLAC, M4A, AAC, WebM</p>
              <p>Max size: {formatFileSize(MAX_FILE_SIZE)} • Up to 3 hours of audio</p>
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
  )
}
