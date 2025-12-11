import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  const supabase = await createClient()
  
  if (!supabase) {
    // Supabase not configured, show setup message
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-8 max-w-md text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/20 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Setup Required</h1>
          <p className="text-slate-400 mb-4">
            Please configure your Supabase environment variables to continue.
          </p>
          <p className="text-slate-500 text-sm">
            Add <code className="text-amber-400">NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
            <code className="text-amber-400">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to your{' '}
            <code className="text-amber-400">.env.local</code> file.
          </p>
        </div>
      </div>
    )
  }
  
  const { data: { user }, error } = await supabase.auth.getUser()
  
  if (error || !user) {
    redirect('/login')
  }

  return <DashboardClient user={user} />
}
