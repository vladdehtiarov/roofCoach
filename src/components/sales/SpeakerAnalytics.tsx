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

  // Handle both old and new field names
  const repTalkPercent = analytics.speaker_share_rep ?? analytics.rep_talk_percent ?? 50
  const customerTalkPercent = analytics.customer_talk_percent ?? (100 - repTalkPercent)
  const questionsAsked = analytics.questions_asked ?? analytics.questions_by_rep ?? 0
  const questionsReceived = analytics.questions_received ?? 0
  const pacing = analytics.pacing_wpm ?? 150
  const conversationTime = analytics.conversation_time ?? 'N/A'
  const repSpeakingTime = analytics.rep_speaking_time ?? 'N/A'
  const customerSpeakingTime = analytics.customer_speaking_time ?? 'N/A'
  const longestMonologue = analytics.longest_monologue ?? 'N/A'

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Speaker Analytics
      </h3>

      <div className="space-y-1">
        {conversationTime !== 'N/A' && <MetricRow label="Conversation time" value={conversationTime} highlight />}
        <MetricRow label="Rep talk share" value={`${repTalkPercent}%`} />
        <MetricRow label="Customer talk share" value={`${customerTalkPercent}%`} />
        {pacing && <MetricRow label="Pacing" value={`${pacing} WPM`} />}
        {repSpeakingTime !== 'N/A' && <MetricRow label="Time speaking" value={repSpeakingTime} />}
        {customerSpeakingTime !== 'N/A' && <MetricRow label="Time listening" value={customerSpeakingTime} />}
        <MetricRow label="Questions asked" value={questionsAsked} />
        {questionsReceived > 0 && <MetricRow label="Questions received" value={questionsReceived} />}
        {longestMonologue !== 'N/A' && <MetricRow label="Longest monologue" value={longestMonologue} />}
      </div>
    </div>
  )
}

