export default function RecordingLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header skeleton */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-700/50 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="h-8 w-32 bg-slate-700/50 rounded animate-pulse" />
            <div className="h-10 w-10 bg-slate-700/50 rounded-full animate-pulse" />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back button */}
        <div className="h-6 w-24 bg-slate-700/50 rounded animate-pulse mb-6" />
        
        {/* Recording header */}
        <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="space-y-2">
              <div className="h-8 w-64 bg-slate-700/50 rounded animate-pulse" />
              <div className="h-4 w-40 bg-slate-700/50 rounded animate-pulse" />
            </div>
            <div className="h-10 w-32 bg-slate-700/50 rounded-lg animate-pulse" />
          </div>
          
          {/* Audio player skeleton */}
          <div className="bg-slate-700/30 rounded-xl p-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-700/50 rounded-full animate-pulse" />
              <div className="flex-1 h-2 bg-slate-700/50 rounded-full animate-pulse" />
              <div className="h-4 w-16 bg-slate-700/50 rounded animate-pulse" />
            </div>
          </div>
        </div>

        {/* Analysis section skeleton */}
        <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50">
          {/* Tabs */}
          <div className="flex gap-2 mb-6 border-b border-slate-700/50 pb-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 w-24 bg-slate-700/50 rounded-lg animate-pulse" />
            ))}
          </div>
          
          {/* Content skeleton */}
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-4 bg-slate-700/50 rounded animate-pulse" style={{ width: `${100 - i * 10}%` }} />
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}

