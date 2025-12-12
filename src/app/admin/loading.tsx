export default function AdminLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header skeleton */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-700/50 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="h-8 w-32 bg-slate-700/50 rounded animate-pulse" />
              <div className="h-6 w-16 bg-red-500/30 rounded animate-pulse" />
            </div>
            <div className="h-10 w-10 bg-slate-700/50 rounded-full animate-pulse" />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats grid skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50">
              <div className="h-4 w-24 bg-slate-700/50 rounded animate-pulse mb-2" />
              <div className="h-10 w-20 bg-slate-700/50 rounded animate-pulse" />
            </div>
          ))}
        </div>

        {/* Chart skeleton */}
        <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50 mb-8">
          <div className="h-6 w-48 bg-slate-700/50 rounded animate-pulse mb-6" />
          <div className="h-64 bg-slate-700/30 rounded-xl animate-pulse" />
        </div>

        {/* Tables skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2].map((i) => (
            <div key={i} className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50">
              <div className="h-6 w-32 bg-slate-700/50 rounded animate-pulse mb-4" />
              <div className="space-y-3">
                {[1, 2, 3, 4].map((j) => (
                  <div key={j} className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-700/50 rounded-full animate-pulse" />
                    <div className="flex-1 h-4 bg-slate-700/50 rounded animate-pulse" />
                    <div className="h-6 w-16 bg-slate-700/50 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}

