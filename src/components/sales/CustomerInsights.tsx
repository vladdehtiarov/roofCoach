'use client'

import { CustomerAnalysis, InsightWithTimestamps } from '@/types/database'

interface Props {
  analysis: CustomerAnalysis | null
  onTimestampClick?: (timestamp: string) => void
  onStartAnalysis?: () => void
  isAnalyzing?: boolean
}

function InsightSection({
  title,
  icon,
  insights,
  onTimestampClick,
  accentColor = 'amber'
}: {
  title: string
  icon: string
  insights: InsightWithTimestamps[]
  onTimestampClick?: (timestamp: string) => void
  accentColor?: 'amber' | 'red' | 'blue' | 'emerald'
}) {
  const colorClasses = {
    amber: 'border-amber-500/30 bg-amber-500/5',
    red: 'border-red-500/30 bg-red-500/5',
    blue: 'border-blue-500/30 bg-blue-500/5',
    emerald: 'border-emerald-500/30 bg-emerald-500/5',
  }

  const timestampColors = {
    amber: 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30',
    red: 'bg-red-500/20 text-red-400 hover:bg-red-500/30',
    blue: 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30',
    emerald: 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30',
  }

  if (!insights || insights.length === 0) return null

  return (
    <div className={`rounded-xl border ${colorClasses[accentColor]} p-4`}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-white font-medium flex items-center gap-2">
          <span>{icon}</span>
          {title}
        </h4>
        <button className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Copy
        </button>
      </div>

      <div className="space-y-3">
        {insights.map((insight, idx) => (
          <div key={idx} className="text-sm">
            <p className="text-slate-300 leading-relaxed">
              - {insight.text}
              {insight.type && (
                <span className="ml-2 text-xs text-slate-500">({insight.type})</span>
              )}
            </p>
            {insight.timestamps && insight.timestamps.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {insight.timestamps.map((ts, tsIdx) => (
                  <button
                    key={tsIdx}
                    onClick={() => onTimestampClick?.(ts)}
                    className={`px-2 py-0.5 text-xs font-mono rounded ${timestampColors[accentColor]} transition-colors`}
                  >
                    {ts}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function CustomerInsights({ analysis, onTimestampClick, onStartAnalysis, isAnalyzing }: Props) {
  if (!analysis) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
        <div className="text-center py-12">
          <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center mb-6">
            {isAnalyzing ? (
              <svg className="animate-spin w-10 h-10 text-amber-400" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-10 h-10 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            )}
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">
            {isAnalyzing ? 'Analyzing...' : 'Ready for AI Analysis'}
          </h3>
          <p className="text-slate-400 mb-6">
            {isAnalyzing 
              ? 'This may take a few minutes for long recordings' 
              : 'Get detailed insights, scorecard, and coaching recommendations'}
          </p>
          {onStartAnalysis && !isAnalyzing && (
            <button
              onClick={onStartAnalysis}
              className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium rounded-xl hover:from-amber-600 hover:to-orange-600 transition-all flex items-center gap-2 mx-auto"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Start Analysis
            </button>
          )}
        </div>
      </div>
    )
  }

  // Handle both old and new field names
  const needs = analysis.needs_motivation || analysis.needs || []
  const painPoints = analysis.pain_points || []
  const objections = analysis.objections || []
  const nextSteps = analysis.outcomes_next_steps || analysis.next_steps || []

  return (
    <div className="space-y-4">
      <InsightSection
        title="Customer Need & Motivation"
        icon="📋"
        insights={needs}
        onTimestampClick={onTimestampClick}
        accentColor="amber"
      />

      <InsightSection
        title="Customer Pain Points"
        icon="📋"
        insights={painPoints}
        onTimestampClick={onTimestampClick}
        accentColor="red"
      />

      <InsightSection
        title="Key Objections & Resistance"
        icon="📋"
        insights={objections}
        onTimestampClick={onTimestampClick}
        accentColor="blue"
      />

      <InsightSection
        title="Outcome & Next Steps"
        icon="📋"
        insights={nextSteps}
        onTimestampClick={onTimestampClick}
        accentColor="emerald"
      />
    </div>
  )
}

