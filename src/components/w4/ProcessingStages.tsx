'use client'

import { useEffect, useState } from 'react'

type Stage = 'pending' | 'analyzing' | 'done' | 'error'

interface ProcessingStagesProps {
  currentStage: Stage | 'transcribing'
  message?: string
  errorMessage?: string
}

export function ProcessingStages({ currentStage, message, errorMessage }: ProcessingStagesProps) {
  const [dots, setDots] = useState('')
  
  const normalizedStage = currentStage === 'transcribing' ? 'analyzing' : currentStage
  const isProcessing = normalizedStage === 'analyzing'
  
  useEffect(() => {
    if (isProcessing) {
      const interval = setInterval(() => {
        setDots(d => d.length >= 3 ? '' : d + '.')
      }, 500)
      return () => clearInterval(interval)
    }
  }, [isProcessing])

  if (normalizedStage === 'error') {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
          <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-white mb-2">Analysis Failed</h2>
        {errorMessage && <p className="text-sm text-red-400 max-w-md mx-auto">{errorMessage}</p>}
      </div>
    )
  }

  return (
    <div className="text-center py-8">
      {/* Spinning Icon */}
      <div className="relative w-20 h-20 mx-auto mb-6">
        {/* Spinning ring */}
        <svg className="w-full h-full animate-spin" viewBox="0 0 100 100">
          <circle 
            cx="50" cy="50" r="40" 
            fill="none" 
            stroke="rgba(251, 146, 60, 0.2)" 
            strokeWidth="8"
          />
          <circle 
            cx="50" cy="50" r="40" 
            fill="none" 
            stroke="url(#gradient)" 
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray="180 360"
          />
          <defs>
            <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#fbbf24" />
            </linearGradient>
          </defs>
        </svg>
        {/* Center icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <svg className="w-8 h-8 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
      </div>

      {/* Title */}
      <h2 className="text-xl font-semibold text-white mb-1">
        Analyzing Your Call{dots}
      </h2>
      <p className="text-sm text-gray-400 mb-4">W4 Sales System methodology</p>

      {/* Current Action - this is the real info from server */}
      {message && (
        <div className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-800/60 border border-gray-700/50 rounded-lg">
          <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
          <span className="text-sm text-gray-300">{message}</span>
        </div>
      )}
      
      {!message && (
        <p className="text-xs text-gray-500">This may take a few minutes for long recordings</p>
      )}
    </div>
  )
}
