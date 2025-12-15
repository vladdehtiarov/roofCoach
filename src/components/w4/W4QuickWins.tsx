'use client'

import { W4QuickWin, W4RankAssessment } from '@/types/database'

interface Props {
  quickWins: W4QuickWin[]
  rankAssessment: W4RankAssessment
}

export function W4QuickWins({ quickWins, rankAssessment }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Rank Assessment */}
      <div className="bg-gray-900/50 rounded-xl border border-gray-800 overflow-hidden">
        <div className="p-4 border-b border-gray-800 flex items-center gap-2">
          <svg className="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <h3 className="font-semibold text-white">Rank Assessment</h3>
        </div>
        
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">Current Rank:</span>
            <span className={`px-3 py-1 rounded-full text-sm font-bold ${getRankStyles(rankAssessment.current_rank)}`}>
              {rankAssessment.current_rank}
            </span>
          </div>
          
          <div>
            <h4 className="text-sm text-gray-500 mb-2">Next Level Requirements:</h4>
            <p className="text-sm text-gray-300 bg-gray-800/30 rounded-lg p-3">
              {rankAssessment.next_level_requirements}
            </p>
          </div>
        </div>
      </div>
      
      {/* Quick Wins */}
      <div className="bg-gray-900/50 rounded-xl border border-gray-800 overflow-hidden">
        <div className="p-4 border-b border-gray-800 flex items-center gap-2">
          <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <h3 className="font-semibold text-white">Quick Wins</h3>
          <span className="text-xs text-gray-500">(Biggest ROI Improvements)</span>
        </div>
        
        <div className="p-4 space-y-3">
          {quickWins.length > 0 ? (
            quickWins.map((win, index) => (
              <div key={index} className="bg-gray-800/30 rounded-lg p-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-start gap-2">
                    <span className="bg-amber-500/20 text-amber-500 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                      {index + 1}
                    </span>
                    <h4 className="text-sm font-medium text-white">{win.title}</h4>
                  </div>
                  <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full whitespace-nowrap">
                    +{win.points_worth} pts
                  </span>
                </div>
                <p className="text-xs text-gray-400 ml-7">{win.action}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-500 italic">No quick wins identified</p>
          )}
        </div>
      </div>
    </div>
  )
}

function getRankStyles(rank: string): string {
  switch (rank) {
    case 'MVP':
      return 'bg-green-500/20 text-green-400 border border-green-500/30'
    case 'Playmaker':
      return 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
    case 'Starter':
      return 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
    case 'Prospect':
      return 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
    default:
      return 'bg-red-500/20 text-red-400 border border-red-500/30'
  }
}

