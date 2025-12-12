'use client'

import { useState } from 'react'
import { Scorecard, ScorecardCategory, ScorecardItem } from '@/types/database'

interface Props {
  scorecard: Scorecard | null
  onTimestampClick?: (timestamp: string) => void
}

// Circular progress component
function CircularProgress({ value, size = 120, strokeWidth = 8, color = '#F59E0B' }: {
  value: number
  size?: number
  strokeWidth?: number
  color?: string
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (value / 100) * circumference

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#374151"
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-white">{value}</span>
        <span className="text-xs text-slate-400">of 100</span>
      </div>
    </div>
  )
}

// Progress bar component
function ProgressBar({ value, label, color = '#10B981' }: {
  value: number
  label: string
  color?: string
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-slate-300 w-32">{label}</span>
      <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${value}%`, backgroundColor: color }}
        />
      </div>
      <span className={`text-sm font-medium w-8 text-right ${value >= 80 ? 'text-emerald-400' : value >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
        {value}
      </span>
    </div>
  )
}

// Category breakdown component
function CategoryBreakdown({ 
  category, 
  name, 
  isExpanded, 
  onToggle,
  onTimestampClick 
}: {
  category: ScorecardCategory
  name: string
  isExpanded: boolean
  onToggle: () => void
  onTimestampClick?: (timestamp: string) => void
}) {
  const scoreColor = category.score >= 80 ? '#10B981' : category.score >= 50 ? '#F59E0B' : '#EF4444'

  return (
    <div className="border-b border-slate-700/50 last:border-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-white font-medium">{name}</span>
          <span className="text-xs text-slate-500">Category Weight: {category.weight}%</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`font-semibold ${category.score >= 80 ? 'text-emerald-400' : category.score >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
            {category.score}
          </span>
          <svg
            className={`w-5 h-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-2 animate-fade-in">
          {category.items.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between py-2 pl-4 border-l-2 border-slate-700 hover:border-amber-500 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-300">{item.name}</span>
                {item.timestamp && (
                  <button
                    onClick={() => onTimestampClick?.(item.timestamp!)}
                    className="text-xs text-amber-400 hover:text-amber-300 font-mono"
                  >
                    {item.timestamp}
                  </button>
                )}
              </div>
              <span className={`text-sm font-medium ${item.score >= 80 ? 'text-emerald-400' : item.score >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                {item.score}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function SalesScorecard({ scorecard, onTimestampClick }: Props) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)

  if (!scorecard) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto rounded-full bg-slate-700/50 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-slate-500">Scorecard not available</p>
          <p className="text-xs text-slate-600 mt-1">Run AI analysis to generate scorecard</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Main Scorecard */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
        <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
          <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Scorecard
        </h3>

        <div className="flex items-start gap-8">
          {/* Circular score */}
          <CircularProgress value={scorecard.total} />

          {/* Category bars */}
          <div className="flex-1 space-y-4">
            <ProgressBar
              label="Process"
              value={scorecard.process.score}
              color="#10B981"
            />
            <ProgressBar
              label="Skills"
              value={scorecard.skills.score}
              color="#3B82F6"
            />
            <ProgressBar
              label="Communication"
              value={scorecard.communication.score}
              color="#8B5CF6"
            />
          </div>
        </div>
      </div>

      {/* Performance Breakdown */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <h3 className="text-lg font-semibold text-white p-4 border-b border-slate-700/50">
          Performance Breakdown
        </h3>

        <CategoryBreakdown
          category={scorecard.process}
          name="Process"
          isExpanded={expandedCategory === 'process'}
          onToggle={() => setExpandedCategory(expandedCategory === 'process' ? null : 'process')}
          onTimestampClick={onTimestampClick}
        />
        <CategoryBreakdown
          category={scorecard.skills}
          name="Skills"
          isExpanded={expandedCategory === 'skills'}
          onToggle={() => setExpandedCategory(expandedCategory === 'skills' ? null : 'skills')}
          onTimestampClick={onTimestampClick}
        />
        <CategoryBreakdown
          category={scorecard.communication}
          name="Communication"
          isExpanded={expandedCategory === 'communication'}
          onToggle={() => setExpandedCategory(expandedCategory === 'communication' ? null : 'communication')}
          onTimestampClick={onTimestampClick}
        />
      </div>
    </div>
  )
}

