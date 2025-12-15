'use client'

import { useEffect, useState } from 'react'

type Stage = 'pending' | 'analyzing' | 'done' | 'error'

interface ProcessingStagesProps {
  currentStage: Stage | 'transcribing'
  message?: string
  errorMessage?: string
}

const LoaderIcon = () => (
  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
)

export function ProcessingStages({ currentStage, message, errorMessage }: ProcessingStagesProps) {
  const [dots, setDots] = useState('')
  const [progress, setProgress] = useState(0)
  
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

  useEffect(() => {
    if (isProcessing) {
      const interval = setInterval(() => {
        setProgress(p => {
          if (p >= 95) return p
          const increment = p < 30 ? 2 : p < 60 ? 1 : p < 80 ? 0.5 : 0.2
          return Math.min(p + increment, 95)
        })
      }, 1000)
      return () => clearInterval(interval)
    } else if (normalizedStage === 'done') {
      setProgress(100)
    }
  }, [isProcessing, normalizedStage])

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
      {/* Pulsing Icon */}
      <div className="relative w-20 h-20 mx-auto mb-6">
        <div className="absolute inset-0 rounded-full bg-orange-500/20 animate-ping" />
        <div className="relative w-full h-full rounded-full bg-gradient-to-br from-orange-500/30 to-amber-500/30 border-2 border-orange-500/50 flex items-center justify-center">
          <svg className="w-10 h-10 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
      </div>

      {/* Title */}
      <h2 className="text-xl font-semibold text-white mb-1">
        Analyzing Your Call{dots}
      </h2>
      <p className="text-sm text-gray-400 mb-6">W4 Sales System methodology</p>

      {/* Progress Bar */}
      <div className="max-w-xs mx-auto mb-4">
        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-orange-500 to-amber-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-2">{Math.round(progress)}%</p>
      </div>

      {/* Current Action */}
      {message && (
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800/50 rounded-full">
          <LoaderIcon />
          <span className="text-sm text-gray-300">{message}</span>
        </div>
      )}
    </div>
  )
}
