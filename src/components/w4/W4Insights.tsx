'use client'

interface AreaForImprovement {
  area?: string
  recommendation?: string
}

interface Props {
  whatDoneRight: string[]
  areasForImprovement: (string | AreaForImprovement)[]
  weakestElements: string[]
}

export function W4Insights({ whatDoneRight, areasForImprovement, weakestElements }: Props) {
  // Normalize areas to handle both string and object formats
  const normalizedAreas = areasForImprovement?.map(item => {
    if (typeof item === 'string') {
      return { area: item, recommendation: '' }
    }
    return item as AreaForImprovement
  }) || []

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* What Was Done Right */}
      <div className="bg-gradient-to-br from-green-500/5 to-transparent rounded-2xl border border-green-500/20 overflow-hidden">
        <div className="p-4 border-b border-green-500/20 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="font-semibold text-white">What Was Done Right</h3>
        </div>
        <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
          {whatDoneRight?.length > 0 ? (
            whatDoneRight.map((item, index) => (
              <div key={index} className="flex gap-3 p-3 bg-green-500/5 rounded-lg border border-green-500/10">
                <span className="text-green-400 font-bold mt-0.5">✓</span>
                <p className="text-sm text-gray-300 leading-relaxed">{item}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-500 italic text-center py-8">No positive highlights identified</p>
          )}
        </div>
      </div>
      
      {/* Areas for Improvement */}
      <div className="bg-gradient-to-br from-yellow-500/5 to-transparent rounded-2xl border border-yellow-500/20 overflow-hidden">
        <div className="p-4 border-b border-yellow-500/20 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h3 className="font-semibold text-white">Areas for Improvement</h3>
        </div>
        <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
          {normalizedAreas.length > 0 ? (
            normalizedAreas.map((item, index) => (
              <div key={index} className="p-3 bg-yellow-500/5 rounded-lg border border-yellow-500/10">
                {item.area && (
                  <p className="text-sm font-medium text-yellow-400 mb-1.5">{item.area}</p>
                )}
                {item.recommendation && (
                  <p className="text-sm text-gray-400 leading-relaxed">{item.recommendation}</p>
                )}
                {!item.area && !item.recommendation && (
                  <p className="text-sm text-gray-400">{JSON.stringify(item)}</p>
                )}
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-500 italic text-center py-8">No improvements identified</p>
          )}
        </div>
      </div>
      
      {/* Weakest Elements */}
      <div className="bg-gradient-to-br from-red-500/5 to-transparent rounded-2xl border border-red-500/20 overflow-hidden">
        <div className="p-4 border-b border-red-500/20 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="font-semibold text-white">Weakest Elements</h3>
        </div>
        <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
          {weakestElements?.length > 0 ? (
            weakestElements.map((item, index) => (
              <div key={index} className="flex gap-3 p-3 bg-red-500/5 rounded-lg border border-red-500/10">
                <span className="text-red-400 font-bold mt-0.5">!</span>
                <p className="text-sm text-gray-300 leading-relaxed">{item}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-500 italic text-center py-8">No critical weaknesses identified</p>
          )}
        </div>
      </div>
    </div>
  )
}
