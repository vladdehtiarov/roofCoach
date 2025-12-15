'use client'

import { W4Phase } from '@/types/database'

interface Props {
  phases: {
    why: W4Phase
    what: W4Phase
    who: W4Phase
    when: W4Phase
  }
  totalScore: number
}

export function W4TotalScores({ phases, totalScore }: Props) {
  const phaseData = [
    { name: 'WHY', phase: phases.why, color: '#3b82f6' },
    { name: 'WHAT', phase: phases.what, color: '#8b5cf6' },
    { name: 'WHO', phase: phases.who, color: '#f97316' },
    { name: 'WHEN', phase: phases.when, color: '#22c55e' },
  ]
  
  return (
    <div className="bg-gray-900/50 rounded-xl border border-gray-800 overflow-hidden">
      <div className="p-4 border-b border-gray-800">
        <h3 className="font-semibold text-white">Total Scores</h3>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-800/30">
              <th className="px-4 py-3 text-left text-gray-400 font-medium">Phase</th>
              <th className="px-4 py-3 text-center text-gray-400 font-medium">Score</th>
              <th className="px-4 py-3 text-center text-gray-400 font-medium">Max</th>
              <th className="px-4 py-3 text-right text-gray-400 font-medium">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {phaseData.map(({ name, phase, color }) => {
              const percentage = Math.round((phase.score / phase.max_score) * 100)
              return (
                <tr key={name} className="hover:bg-gray-800/20">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-gray-200">{name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center font-mono text-gray-200">
                    {phase.score}
                  </td>
                  <td className="px-4 py-3 text-center font-mono text-gray-500">
                    {phase.max_score}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span 
                      className="font-mono"
                      style={{ color: getPercentageColor(percentage) }}
                    >
                      {percentage}%
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gray-800/50 font-semibold">
              <td className="px-4 py-3 text-white">Overall Total</td>
              <td className="px-4 py-3 text-center font-mono text-white">{totalScore}</td>
              <td className="px-4 py-3 text-center font-mono text-gray-500">100</td>
              <td className="px-4 py-3 text-right">
                <span 
                  className="font-mono"
                  style={{ color: getPercentageColor(totalScore) }}
                >
                  {totalScore}%
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function getPercentageColor(percentage: number): string {
  if (percentage >= 90) return '#22c55e'  // MVP
  if (percentage >= 75) return '#3b82f6'  // Playmaker
  if (percentage >= 60) return '#eab308'  // Starter
  if (percentage >= 45) return '#f97316'  // Prospect
  return '#ef4444'                         // Below Prospect
}

