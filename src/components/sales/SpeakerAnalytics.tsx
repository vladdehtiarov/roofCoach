'use client'

import { SpeakerAnalytics as SpeakerAnalyticsType } from '@/types/database'

interface Props {
  analytics: SpeakerAnalyticsType | null
}

function MetricRow({ label, value, highlight = false }: { 
  label: string
  value: string | number
  highlight?: boolean 
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-700/50 last:border-0">
      <span className="text-slate-400">{label}</span>
      <span className={`font-medium ${highlight ? 'text-amber-400' : 'text-white'}`}>
        {value}
      </span>
    </div>
  )
}

export default function SpeakerAnalytics({ analytics }: Props) {
  if (!analytics) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto rounded-full bg-slate-700/50 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <p className="text-slate-500">Speaker analytics not available</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Speaker Analytics
        <span className="ml-auto">
          <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </span>
      </h3>

      <div className="space-y-1">
        <MetricRow label="Conversation time" value={analytics.conversation_time} highlight />
        <MetricRow label="Speaker share" value={`${analytics.speaker_share_rep}%`} />
        <MetricRow label="Pacing" value={`${analytics.pacing_wpm} WPM`} />
        <MetricRow label="Interactivity" value={`${(analytics.exchanges / (parseInt(analytics.conversation_time) || 60)).toFixed(1)} per min`} />
        <MetricRow label="Exchanges" value={analytics.exchanges} />
        <MetricRow label="Rep words spoken" value={Math.round(analytics.pacing_wpm * (parseInt(analytics.rep_speaking_time) || 0) / 60).toLocaleString()} />
        <MetricRow label="Time speaking" value={analytics.rep_speaking_time} />
        <MetricRow label="Time listening" value={analytics.customer_speaking_time} />
        <MetricRow label="Questions asked" value={analytics.questions_asked} />
        <MetricRow label="Questions received" value={analytics.questions_received} />
        <MetricRow label="Longest monologue" value={analytics.longest_monologue} />
        <MetricRow label="Control" value={`${Math.round(100 - analytics.speaker_share_rep)}%`} />
      </div>
    </div>
  )
}

