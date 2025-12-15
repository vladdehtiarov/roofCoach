'use client'

import { useState } from 'react'
import { W4Phase, W4Checkpoint } from '@/types/database'

interface Props {
  phaseName: 'WHY' | 'WHAT' | 'WHO' | 'WHEN'
  phase: W4Phase
  description: string
  color: string
}

export function W4PhaseCard({ phaseName, phase, description, color }: Props) {
  const [expandedCheckpoint, setExpandedCheckpoint] = useState<string | null>(null)
  
  const percentage = Math.round((phase.score / phase.max_score) * 100)
  
  return (
    <div className="bg-gray-900/50 rounded-xl border border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold"
              style={{ backgroundColor: `${color}20`, color: color }}
            >
              {phaseName}
            </div>
            <div>
              <h3 className="font-semibold text-white">Phase: {phaseName}</h3>
              <p className="text-xs text-gray-500">{description}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-white">
              {phase.score}<span className="text-gray-500 text-lg">/{phase.max_score}</span>
            </div>
            <div className="text-xs text-gray-500">{percentage}%</div>
          </div>
        </div>
        
        {/* Progress bar */}
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
          <div 
            className="h-full rounded-full transition-all duration-500"
            style={{ 
              width: `${percentage}%`,
              backgroundColor: color
            }}
          />
        </div>
      </div>
      
      {/* Checkpoints */}
      <div className="divide-y divide-gray-800/50">
        {phase.checkpoints.map((checkpoint: W4Checkpoint, index: number) => {
          const isExpanded = expandedCheckpoint === checkpoint.name
          const checkpointPercentage = Math.round((checkpoint.score / checkpoint.max_score) * 100)
          
          return (
            <div key={index} className="hover:bg-gray-800/30 transition-colors">
              <button
                onClick={() => setExpandedCheckpoint(isExpanded ? null : checkpoint.name)}
                className="w-full p-3 flex items-center gap-3 text-left"
              >
                {/* Score indicator */}
                <div 
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{
                    backgroundColor: getScoreColor(checkpointPercentage, 0.15),
                    color: getScoreColor(checkpointPercentage, 1)
                  }}
                >
                  {checkpoint.score}
                </div>
                
                {/* Name */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200 truncate">{checkpoint.name}</p>
                  <p className="text-xs text-gray-500">Max: {checkpoint.max_score} pts</p>
                </div>
                
                {/* Progress mini bar */}
                <div className="w-16 flex-shrink-0">
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full"
                      style={{ 
                        width: `${checkpointPercentage}%`,
                        backgroundColor: getScoreColor(checkpointPercentage, 1)
                      }}
                    />
                  </div>
                </div>
                
                {/* Expand icon */}
                <svg 
                  className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {/* Justification */}
              {isExpanded && checkpoint.justification && (
                <div className="px-4 pb-4 pt-0">
                  <div className="bg-gray-800/50 rounded-lg p-3 ml-11">
                    <p className="text-xs text-gray-400 leading-relaxed">
                      {checkpoint.justification}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function getScoreColor(percentage: number, opacity: number): string {
  if (percentage >= 80) return `rgba(34, 197, 94, ${opacity})`  // Green
  if (percentage >= 60) return `rgba(234, 179, 8, ${opacity})`  // Yellow
  if (percentage >= 40) return `rgba(249, 115, 22, ${opacity})` // Orange
  return `rgba(239, 68, 68, ${opacity})`                        // Red
}

