'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import Uppy from '@uppy/core'
import Tus from '@uppy/tus'
import { createClient } from '@/lib/supabase/client'
import { Recording, RecordingInsert } from '@/types/database'

interface Props {
  onUploadComplete?: (recording: Recording) => void
  onUploadError?: (error: Error) => void
}

interface FileProgress {
  id: string
  name: string
  size: number
  progress: number
  status: 'pending' | 'uploading' | 'complete' | 'error'
  error?: string
}

export default function UppyAudioUploader({ onUploadComplete, onUploadError }: Props) {
  const [userId, setUserId] = useState<string | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [files, setFiles] = useState<FileProgress[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uppyRef = useRef<Uppy | null>(null)
  const tokenRef = useRef<string | null>(null)

  const supabase = useMemo(() => {
    try {
      return createClient()
    } catch {
      return null
    }
  }, [])

  // Keep token ref updated
  useEffect(() => {
    tokenRef.current = accessToken
  }, [accessToken])

  // Get session and token
  useEffect(() => {
    const getSession = async () => {
      if (!supabase) return
      
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setUserId(session.user.id)
        setAccessToken(session.access_token)
        tokenRef.current = session.access_token
        setIsReady(true)
      }
    }
    getSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase?.auth.onAuthStateChange((event, session) => {
      if (session) {
        setAccessToken(session.access_token)
        tokenRef.current = session.access_token
      }
    }) || { data: { subscription: null } }

    return () => {
      subscription?.unsubscribe()
    }
  }, [supabase])

  // Initialize Uppy only when we have both userId AND accessToken
  useEffect(() => {
    if (!userId || !accessToken || !supabase || !isReady) return

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    
    if (!supabaseUrl || !supabaseAnonKey) return

    // Cleanup previous instance
    if (uppyRef.current) {
      uppyRef.current.cancelAll()
    }

    const uppy = new Uppy({
      id: 'audio-uploader',
      autoProceed: false, // Don't auto-proceed, we'll start manually after setting headers
      restrictions: {
        maxFileSize: 500 * 1024 * 1024,
        maxNumberOfFiles: 5,
        allowedFileTypes: [
          'audio/*',
          '.mp3',
          '.wav',
          '.ogg',
          '.flac',
          '.m4a',
          '.aac',
          '.webm',
        ],
      },
    })

    uppy.use(Tus, {
      endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        apikey: supabaseAnonKey,
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      allowedMetaFields: ['bucketName', 'objectName', 'contentType', 'cacheControl'],
      retryDelays: [0, 1000, 3000, 5000],
      onBeforeRequest: async (req) => {
        // Get fresh token
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) {
          req.setHeader('Authorization', `Bearer ${session.access_token}`)
        }
      },
    })

    uppy.on('file-added', (file) => {
      const timestamp = Date.now()
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
      const objectName = `${userId}/${timestamp}-${sanitizedName}`

      uppy.setFileMeta(file.id, {
        bucketName: 'audio-files',
        objectName: objectName,
        contentType: file.type || 'audio/mpeg',
        cacheControl: '3600',
      })

      setFiles(prev => [...prev, {
        id: file.id,
        name: file.name,
        size: file.size || 0,
        progress: 0,
        status: 'pending',
      }])

      // Start upload after file is added and meta is set
      setTimeout(() => {
        uppy.upload()
      }, 100)
    })

    uppy.on('upload-progress', (file, progress) => {
      if (!file) return
      const percent = progress.bytesTotal ? Math.round((progress.bytesUploaded / progress.bytesTotal) * 100) : 0
      setFiles(prev => prev.map(f => 
        f.id === file.id ? { ...f, progress: percent, status: 'uploading' } : f
      ))
    })

    uppy.on('upload-success', async (file) => {
      if (!file || !supabase) return

      setFiles(prev => prev.map(f => 
        f.id === file.id ? { ...f, progress: 100, status: 'complete' } : f
      ))

      try {
        const recordingInsert: RecordingInsert = {
          user_id: userId,
          file_path: file.meta.objectName as string,
          file_name: file.name,
          file_size: file.size || 0,
          status: 'done',
        }

        const { data: newRecording, error } = await supabase
          .from('recordings')
          .insert(recordingInsert)
          .select()
          .single()

        if (error) {
          console.error('DB error:', error)
          onUploadError?.(new Error(`Failed to save recording: ${error.message}`))
        } else if (newRecording) {
          onUploadComplete?.(newRecording)
        }
      } catch (err) {
        console.error('Save error:', err)
        onUploadError?.(err instanceof Error ? err : new Error('Failed to save recording'))
      }
    })

    uppy.on('upload-error', (file, error) => {
      console.error('Upload error:', error)
      if (!file) return
      setFiles(prev => prev.map(f => 
        f.id === file.id ? { ...f, status: 'error', error: error.message } : f
      ))
      onUploadError?.(error)
    })

    uppyRef.current = uppy

    return () => {
      uppy.cancelAll()
    }
  }, [userId, accessToken, supabase, isReady, onUploadComplete, onUploadError])

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files
    if (!selectedFiles || !uppyRef.current) return

    Array.from(selectedFiles).forEach(file => {
      try {
        uppyRef.current?.addFile({
          name: file.name,
          type: file.type,
          data: file,
        })
      } catch (err) {
        console.error('Error adding file:', err)
      }
    })

    event.target.value = ''
  }, [])

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    setIsDragging(false)

    const droppedFiles = event.dataTransfer.files
    if (!droppedFiles || !uppyRef.current) return

    Array.from(droppedFiles).forEach(file => {
      try {
        uppyRef.current?.addFile({
          name: file.name,
          type: file.type,
          data: file,
        })
      } catch (err) {
        console.error('Error adding file:', err)
      }
    })
  }, [])

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    setIsDragging(false)
  }, [])

  const removeFile = useCallback((fileId: string) => {
    uppyRef.current?.removeFile(fileId)
    setFiles(prev => prev.filter(f => f.id !== fileId))
  }, [])

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  if (!isReady || !accessToken) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 text-amber-500 mx-auto mb-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-slate-400">Loading uploader...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300 ${
          isDragging
            ? 'border-amber-500 bg-amber-500/10'
            : 'border-slate-600 hover:border-amber-500/50 hover:bg-slate-800/50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac,.webm"
          onChange={handleFileSelect}
          multiple
          className="hidden"
        />
        <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center transition-colors ${
          isDragging ? 'bg-amber-500/20' : 'bg-slate-700/50'
        }`}>
          <svg className={`w-8 h-8 transition-colors ${isDragging ? 'text-amber-400' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        <p className="text-white font-medium mt-4">
          {isDragging ? 'Drop files here' : 'Drag & drop audio files'}
        </p>
        <p className="text-slate-400 text-sm mt-1">or click to browse</p>
        <div className="text-slate-500 text-xs mt-4">
          <p>Supports: MP3, WAV, OGG, FLAC, M4A, AAC, WebM</p>
          <p>Max size: 500 MB per file • Resumable uploads</p>
        </div>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map(file => (
            <div key={file.id} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  file.status === 'complete' ? 'bg-emerald-500/20' :
                  file.status === 'error' ? 'bg-red-500/20' :
                  'bg-amber-500/20'
                }`}>
                  {file.status === 'complete' ? (
                    <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : file.status === 'error' ? (
                    <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium truncate">{file.name}</p>
                  <p className="text-slate-400 text-sm">
                    {formatFileSize(file.size)}
                    {file.status === 'uploading' && ` • ${file.progress}%`}
                    {file.status === 'complete' && ' • Complete'}
                    {file.status === 'error' && ` • ${file.error || 'Failed'}`}
                  </p>
                </div>
                {file.status !== 'uploading' && (
                  <button
                    onClick={() => removeFile(file.id)}
                    className="p-2 text-slate-400 hover:text-red-400 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              {file.status === 'uploading' && (
                <div className="mt-3">
                  <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-300"
                      style={{ width: `${file.progress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
