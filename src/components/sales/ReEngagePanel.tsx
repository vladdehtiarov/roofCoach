'use client'

import { useState } from 'react'
import { ReEngage } from '@/types/database'

interface Props {
  reEngage: ReEngage | null
  customerName?: string
  repName?: string
}

function InfoRow({ label, value }: { label: string; value: string }) {
  if (!value) return null
  
  return (
    <div className="flex items-start gap-4 py-3 border-b border-slate-700/50 last:border-0">
      <span className="text-slate-400 w-32 flex-shrink-0">{label}</span>
      <span className="text-white">{value}</span>
    </div>
  )
}

export default function ReEngagePanel({ reEngage, customerName, repName }: Props) {
  const [copied, setCopied] = useState(false)

  if (!reEngage) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto rounded-full bg-slate-700/50 flex items-center justify-center mb-4">
            <span className="text-2xl">⚡</span>
          </div>
          <p className="text-slate-500">Re-engage data not available</p>
        </div>
      </div>
    )
  }

  const handleCopy = async () => {
    const message = reEngage.suggested_message || reEngage.follow_up_message
    if (message) {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="space-y-6">
      {/* Overview Section */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Overview</h3>
        
        {/* Recap */}
        <div className="mb-6">
          <h4 className="text-sm font-medium text-slate-400 mb-2">Recap</h4>
          <p className="text-slate-300 leading-relaxed">{reEngage.recap}</p>
        </div>

        {/* Re-Engage Score placeholder */}
        <div className="bg-slate-900/50 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <span className="text-white font-medium">Re-Engage Score</span>
            <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded text-sm font-medium">
              3 / 5
            </span>
          </div>
        </div>

        {/* Details */}
        <div className="space-y-1">
          <InfoRow label="Price Quote" value={reEngage.first_price_quote || reEngage.price_quoted || 'Not mentioned'} />
          <InfoRow label="Final Price Quote" value={reEngage.final_price_quote || 'N/A'} />
          <InfoRow label="Financing" value={reEngage.financing || 'Not discussed'} />
          <InfoRow label="Commitment" value={reEngage.commitment || 'N/A'} />
          <InfoRow label="Main Objection" value={reEngage.main_objection || 'None identified'} />
          <InfoRow label="Emotional Driver" value={reEngage.emotional_tie || reEngage.emotional_driver || 'Not identified'} />
        </div>
      </div>

      {/* Next Steps Section */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Next Steps</h3>
        
        {/* Recommended Action */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-4">
          <h4 className="text-sm font-medium text-amber-400 mb-2">Recommended Action</h4>
          <p className="text-slate-300">{reEngage.recommended_action}</p>
        </div>

        {/* Suggested Message */}
        <div className="bg-slate-900/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-slate-400">Suggested Message</h4>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
            >
              {copied ? (
                <>
                  <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy
                </>
              )}
            </button>
          </div>
          <div className="text-slate-300 whitespace-pre-line text-sm leading-relaxed">
            {reEngage.suggested_message || reEngage.follow_up_message || 'No message suggested'}
          </div>
        </div>
      </div>

      {/* Notes Section */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Notes</h3>
        <div className="text-center py-4 text-slate-500 text-sm">
          Notes you add below will appear here.
        </div>
        <div className="mt-4">
          <textarea
            placeholder="Leave a note..."
            className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
            rows={2}
          />
        </div>
      </div>
    </div>
  )
}

