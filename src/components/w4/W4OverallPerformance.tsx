'use client'

import { W4OverallPerformance as W4OverallPerformanceType, W4Rating, getW4RatingColor } from '@/types/database'

interface Props {
  performance: W4OverallPerformanceType
  clientName: string
  repName: string
  companyName: string
}

export function W4OverallPerformance({ performance, clientName, repName, companyName }: Props) {
  const { total_score, rating, summary } = performance
  const color = getW4RatingColor(rating as W4Rating)
  
  // Calculate stroke dasharray for circular progress
  const radius = 70
  const circumference = 2 * Math.PI * radius
  const progress = (total_score / 100) * circumference
  const strokeDasharray = `${progress} ${circumference}`
  
  return (
    <div className="bg-gray-900/50 rounded-2xl p-6 border border-gray-800">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-white mb-1">Overall Performance</h2>
          <div className="text-sm text-gray-400 space-y-0.5">
            <p><span className="text-gray-500">Client:</span> {clientName}</p>
            <p><span className="text-gray-500">Rep:</span> {repName}</p>
            <p><span className="text-gray-500">Company:</span> {companyName}</p>
          </div>
        </div>
        
        {/* Rating Badge */}
        <div 
          className="px-4 py-2 rounded-full text-sm font-bold"
          style={{ 
            backgroundColor: `${color}20`,
            color: color,
            border: `1px solid ${color}40`
          }}
        >
          {rating}
        </div>
      </div>
      
      {/* Score Circle */}
      <div className="flex items-center gap-8">
        <div className="relative w-44 h-44 flex-shrink-0">
          <svg className="w-full h-full transform -rotate-90">
            {/* Background circle */}
            <circle
              cx="88"
              cy="88"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="12"
              className="text-gray-800"
            />
            {/* Progress circle */}
            <circle
              cx="88"
              cy="88"
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={strokeDasharray}
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          {/* Score text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-5xl font-bold text-white">{total_score}</span>
            <span className="text-gray-500 text-sm">/ 100</span>
          </div>
        </div>
        
        {/* Summary */}
        <div className="flex-1">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Summary</h3>
          <p className="text-gray-300 leading-relaxed">{summary}</p>
        </div>
      </div>
      
      {/* Rating Legend */}
      <div className="mt-6 pt-4 border-t border-gray-800">
        <div className="flex flex-wrap gap-3 text-xs">
          {[
            { rating: 'MVP', range: '90-100', color: '#22c55e' },
            { rating: 'Playmaker', range: '75-89', color: '#3b82f6' },
            { rating: 'Starter', range: '60-74', color: '#eab308' },
            { rating: 'Prospect', range: '45-59', color: '#f97316' },
            { rating: 'Below Prospect', range: '0-44', color: '#ef4444' },
          ].map((item) => (
            <div 
              key={item.rating}
              className={`flex items-center gap-1.5 px-2 py-1 rounded ${
                rating === item.rating ? 'bg-gray-800' : ''
              }`}
            >
              <div 
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-gray-400">{item.rating}</span>
              <span className="text-gray-600">({item.range})</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

