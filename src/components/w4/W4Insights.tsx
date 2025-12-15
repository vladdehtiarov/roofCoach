'use client'

interface Props {
  whatDoneRight: string[]
  areasForImprovement: string[]
  weakestElements: string[]
}

export function W4Insights({ whatDoneRight, areasForImprovement, weakestElements }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* What Was Done Right */}
      <div className="bg-gray-900/50 rounded-xl border border-gray-800 overflow-hidden">
        <div className="p-4 border-b border-gray-800 flex items-center gap-2">
          <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="font-semibold text-white">What Was Done Right</h3>
        </div>
        <div className="p-4 space-y-3 max-h-80 overflow-y-auto">
          {whatDoneRight.length > 0 ? (
            whatDoneRight.map((item, index) => (
              <div key={index} className="flex gap-2">
                <span className="text-green-500 flex-shrink-0">•</span>
                <p className="text-sm text-gray-300">{item}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-500 italic">No positive highlights identified</p>
          )}
        </div>
      </div>
      
      {/* Areas for Improvement */}
      <div className="bg-gray-900/50 rounded-xl border border-gray-800 overflow-hidden">
        <div className="p-4 border-b border-gray-800 flex items-center gap-2">
          <svg className="w-5 h-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          <h3 className="font-semibold text-white">Areas for Improvement</h3>
        </div>
        <div className="p-4 space-y-3 max-h-80 overflow-y-auto">
          {areasForImprovement.length > 0 ? (
            areasForImprovement.map((item, index) => (
              <div key={index} className="flex gap-2">
                <span className="text-yellow-500 flex-shrink-0">•</span>
                <p className="text-sm text-gray-300">{item}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-500 italic">No improvements identified</p>
          )}
        </div>
      </div>
      
      {/* Weakest Elements */}
      <div className="bg-gray-900/50 rounded-xl border border-gray-800 overflow-hidden">
        <div className="p-4 border-b border-gray-800 flex items-center gap-2">
          <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h3 className="font-semibold text-white">Weakest Elements</h3>
        </div>
        <div className="p-4 space-y-3 max-h-80 overflow-y-auto">
          {weakestElements.length > 0 ? (
            weakestElements.map((item, index) => (
              <div key={index} className="flex gap-2">
                <span className="text-red-500 flex-shrink-0">•</span>
                <p className="text-sm text-gray-300">{item}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-500 italic">No critical weaknesses identified</p>
          )}
        </div>
      </div>
    </div>
  )
}

