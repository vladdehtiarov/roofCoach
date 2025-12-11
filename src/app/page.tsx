import Link from 'next/link'
import Image from 'next/image'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMyMDIwMjAiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRjMC0yIDItNCAyLTRzLTItMi00LTItNCAwLTQgMiAwIDIgMiA0IDQgMiA0IDIgMC0yIDAtMnoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-20 pointer-events-none"></div>
      
      {/* Header */}
      <header className="relative border-b border-slate-700/50 bg-slate-900/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Image
              src="/Logo.svg"
              alt="RoofCoach"
              width={140}
              height={40}
              className="h-10 w-auto"
            />
            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 rounded-lg shadow-lg shadow-amber-500/25 transition-all"
              >
                Get started
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative flex-1 flex items-center justify-center px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="mb-8 mt-8">
            <Image
              src="/Logo.svg"
              alt="RoofCoach"
              width={200}
              height={60}
              className="mx-auto mb-6 h-auto"
            />
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-400 text-sm font-medium">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Audio coaching made simple
            </div>
          </div>
          
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white tracking-tight mb-6">
            Upload. Analyze.{' '}
            <span className="bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 bg-clip-text text-transparent">
              Improve.
            </span>
          </h1>
          
          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10">
            RoofCoach helps roofing professionals capture and manage audio recordings from sales calls, inspections, and team meetings. Upload files up to 3 hours long.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              className="w-full sm:w-auto px-8 py-4 text-lg font-semibold text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 rounded-xl shadow-lg shadow-amber-500/25 transition-all"
            >
              Start for free
            </Link>
            <Link
              href="/login"
              className="w-full sm:w-auto px-8 py-4 text-lg font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-all"
            >
              Sign in to your account
            </Link>
          </div>

          {/* Features */}
          <div className="grid sm:grid-cols-3 gap-6 mt-20">
            <div className="p-6 bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50">
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center mb-4 mx-auto">
                <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Easy Upload</h3>
              <p className="text-slate-400 text-sm">Drag & drop audio files up to 500MB. Support for MP3, WAV, M4A, and more.</p>
            </div>
            
            <div className="p-6 bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50">
              <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center mb-4 mx-auto">
                <svg className="w-6 h-6 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Secure Storage</h3>
              <p className="text-slate-400 text-sm">Your recordings are encrypted and stored securely in the cloud.</p>
            </div>
            
            <div className="p-6 bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50">
              <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center mb-4 mx-auto">
                <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Instant Playback</h3>
              <p className="text-slate-400 text-sm">Listen to your recordings anytime, anywhere with our built-in audio player.</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative border-t border-slate-700/50 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-slate-500 text-sm">
            © {new Date().getFullYear()} RoofCoach. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
