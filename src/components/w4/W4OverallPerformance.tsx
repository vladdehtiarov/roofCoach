'use client'

import { W4OverallPerformance as W4OverallPerformanceType, W4Rating, getW4RatingColor, SaleOutcome } from '@/types/database'

interface Props {
  performance: W4OverallPerformanceType
  clientName: string
  repName: string
  companyName: string
  saleOutcome?: SaleOutcome
}

export function W4OverallPerformance({ performance, clientName, repName, companyName, saleOutcome }: Props) {
  const { total_score, raw_score, sale_adjusted_score, rating, summary } = performance
  const color = getW4RatingColor(rating as W4Rating)
  
  const hasAdjustment = raw_score !== undefined && sale_adjusted_score !== undefined && raw_score !== sale_adjusted_score
  const displayScore = total_score
  
  // Calculate stroke dasharray for circular progress
  const radius = 70
  const circumference = 2 * Math.PI * radius
  const progress = (total_score / 100) * circumference
  const strokeDasharray = `${progress} ${circumference}`
  
  // Sale outcome styling
  const getSaleOutcomeStyle = () => {
    if (!saleOutcome) return null
    if (saleOutcome.closed) {
      return { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400', icon: '✓' }
    }
    if (saleOutcome.outcome_type === 'FOLLOW_UP') {
      return { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400', icon: '⏳' }
    }
    return { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', icon: '✗' }
  }
  
  const outcomeStyle = getSaleOutcomeStyle()
  
  return (
    <div className="bg-gray-900/50 rounded-2xl p-6 border border-gray-800">
      {/* Sale Outcome Banner */}
      {saleOutcome && outcomeStyle && (
        <div className={`${outcomeStyle.bg} ${outcomeStyle.border} border rounded-xl p-4 mb-6`}>
          <div className="flex items-center gap-3">
            <span className={`text-2xl`}>{outcomeStyle.icon}</span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className={`font-semibold ${outcomeStyle.text}`}>
                  {saleOutcome.closed ? 'Sale Closed' : 
                   saleOutcome.outcome_type === 'FOLLOW_UP' ? 'Follow-up Scheduled' : 
                   saleOutcome.outcome_type === 'UNKNOWN' ? 'Outcome Unknown' : 'No Sale'}
                </span>
                {hasAdjustment && (
                  <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
                    Score adjusted: {raw_score} → {sale_adjusted_score}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-400 mt-1">{saleOutcome.evidence}</p>
              {saleOutcome.objection_reason && (
                <p className="text-sm text-gray-500 mt-1">
                  <span className="text-gray-600">Objection:</span> {saleOutcome.objection_reason}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
      
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
            <span className="text-5xl font-bold text-white">{displayScore}</span>
            <span className="text-gray-500 text-sm">/ 100</span>
            {hasAdjustment && (
              <span className="text-xs text-gray-600 mt-1 line-through">{raw_score}</span>
            )}
          </div>
        </div>
        
        {/* Summary */}
        <div className="flex-1">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Summary</h3>
          <p className="text-gray-300 leading-relaxed">{summary}</p>
        </div>
      </div>
    </div>
  )
}

