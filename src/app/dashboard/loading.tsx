export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header skeleton */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-700/50 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="h-8 w-32 bg-slate-700/50 rounded animate-pulse" />
            <div className="flex items-center gap-4">
              <div className="h-8 w-24 bg-slate-700/50 rounded animate-pulse" />
              <div className="h-10 w-10 bg-slate-700/50 rounded-full animate-pulse" />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50">
              <div className="h-4 w-24 bg-slate-700/50 rounded animate-pulse mb-2" />
              <div className="h-8 w-16 bg-slate-700/50 rounded animate-pulse" />
            </div>
          ))}
        </div>

        {/* Uploader skeleton */}
        <div className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700/50 border-dashed mb-8">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-slate-700/50 rounded-full animate-pulse" />
            <div className="h-6 w-48 bg-slate-700/50 rounded animate-pulse" />
            <div className="h-4 w-64 bg-slate-700/50 rounded animate-pulse" />
          </div>
        </div>

        {/* Recordings list skeleton */}
        <div className="space-y-4">
          <div className="h-6 w-32 bg-slate-700/50 rounded animate-pulse mb-4" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-700/50 rounded-lg animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-5 w-48 bg-slate-700/50 rounded animate-pulse" />
                <div className="h-4 w-32 bg-slate-700/50 rounded animate-pulse" />
              </div>
              <div className="h-8 w-24 bg-slate-700/50 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}

