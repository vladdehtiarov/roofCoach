'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { ConfirmModal } from '@/components/ui/Modal'
import { StatCardSkeleton, UserTableSkeleton, RecordingListSkeleton } from '@/components/ui/Skeleton'
import { User } from '@supabase/supabase-js'

interface UserStats {
  id: string
  email: string
  role: string
  created_at: string
  updated_at: string
  recordings_count: number
  total_storage_used: number
}

interface UserTokenStats {
  user_id: string
  user_email: string
  total_analyses: number
  total_input_tokens: number
  total_output_tokens: number
  total_tokens: number
  estimated_cost_usd: number
  models_used: string[]
  last_analysis_at: string | null
}

interface PlatformTokenStats {
  total_users: number
  total_analyses: number
  total_input_tokens: number
  total_output_tokens: number
  total_tokens: number
  total_estimated_cost_usd: number
  avg_tokens_per_analysis: number
  most_used_model: string | null
  analyses_today: number
  tokens_today: number
}

interface DailyUsage {
  date: string
  tokens: number
  analyses: number
}

interface RecordingWithUser {
  id: string
  user_id: string
  file_path: string
  file_name: string
  file_size: number
  duration: number | null
  status: string
  is_archived: boolean
  created_at: string
  updated_at: string
  has_transcript: boolean
  transcript_text: string | null
  user_email: string
  user_role: string
}

type Tab = 'users' | 'recordings' | 'usage' | 'prompts'
type TimeRange = 'today' | 'week' | 'month' | 'year'

export default function AdminDashboard({ user }: { user: User }) {
  const [activeTab, setActiveTab] = useState<Tab>('users')
  const [users, setUsers] = useState<UserStats[]>([])
  const [recordings, setRecordings] = useState<RecordingWithUser[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'active' | 'archived'>('active')
  const [searchQuery, setSearchQuery] = useState('')
  
  // Token usage stats
  const [platformStats, setPlatformStats] = useState<PlatformTokenStats | null>(null)
  const [userTokenStats, setUserTokenStats] = useState<UserTokenStats[]>([])
  const [dailyUsage, setDailyUsage] = useState<DailyUsage[]>([])
  const [modelDistribution, setModelDistribution] = useState<Record<string, number>>({})
  const [usageLoading, setUsageLoading] = useState(false)
  const [chartTimeRange, setChartTimeRange] = useState<TimeRange>('month')
  
  // Role change modal
  const [roleModal, setRoleModal] = useState<{ isOpen: boolean; user: UserStats | null; newRole: string }>({
    isOpen: false,
    user: null,
    newRole: '',
  })
  const [isChangingRole, setIsChangingRole] = useState(false)
  
  // Prompts state
  const [prompt, setPrompt] = useState('')
  const [originalPrompt, setOriginalPrompt] = useState('')
  const [promptDescription, setPromptDescription] = useState('')
  const [promptLoading, setPromptLoading] = useState(false)
  const [promptSaving, setPromptSaving] = useState(false)
  const [promptMessage, setPromptMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  
  const router = useRouter()
  const toast = useToast()

  const supabase = useMemo(() => {
    try {
      return createClient()
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'users') {
      loadUsers()
    } else if (activeTab === 'recordings') {
      loadRecordings()
    } else if (activeTab === 'usage') {
      loadTokenStats(chartTimeRange)
    } else if (activeTab === 'prompts') {
      loadPrompt()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, filter, chartTimeRange])

  const loadTokenStats = async (range: TimeRange) => {
    setUsageLoading(true)
    try {
      const response = await fetch(`/api/admin/token-stats?range=${range}`)
      if (!response.ok) throw new Error('Failed to load token stats')
      const data = await response.json()
      
      setPlatformStats(data.platform)
      setUserTokenStats(data.users || [])
      setDailyUsage(data.dailyUsage || [])
      setModelDistribution(data.modelDistribution || {})
    } catch (err) {
      console.error('Error loading token stats:', err)
      toast.error('Failed to load usage statistics')
    } finally {
      setUsageLoading(false)
    }
  }

  const loadPrompt = async () => {
    if (prompt) return // Already loaded
    setPromptLoading(true)
    try {
      const response = await fetch('/api/admin/prompt?name=w4_analysis')
      const data = await response.json()
      
      if (data.prompt) {
        setPrompt(data.prompt.prompt)
        setOriginalPrompt(data.prompt.prompt)
        setPromptDescription(data.prompt.description || '')
      } else {
        // Load default from file
        const defaultResponse = await fetch('/api/admin/prompt/default')
        if (defaultResponse.ok) {
          const defaultData = await defaultResponse.json()
          setPrompt(defaultData.prompt || '')
          setOriginalPrompt(defaultData.prompt || '')
        }
      }
    } catch (err) {
      console.error('Error loading prompt:', err)
      toast.error('Failed to load prompt')
    } finally {
      setPromptLoading(false)
    }
  }

  const savePrompt = async () => {
    setPromptSaving(true)
    setPromptMessage(null)

    try {
      const response = await fetch('/api/admin/prompt', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'w4_analysis',
          prompt,
          description: promptDescription,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Failed to save')
      }

      setOriginalPrompt(prompt)
      setPromptMessage({ type: 'success', text: 'Prompt saved successfully!' })
      toast.success('Prompt saved!')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save'
      setPromptMessage({ type: 'error', text: message })
      toast.error(message)
    } finally {
      setPromptSaving(false)
    }
  }

  const resetPrompt = () => {
    setPrompt(originalPrompt)
    setPromptMessage(null)
  }

  const hasPromptChanges = prompt !== originalPrompt

  const loadUsers = async () => {
    if (!supabase) return
    setLoading(true)
    
    try {
      const { data, error } = await supabase.rpc('admin_get_all_users')
      if (error) throw error
      setUsers(data || [])
    } catch (err) {
      console.error('Error loading users:', err)
      toast.error('Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  const loadRecordings = async () => {
    if (!supabase) return
    setLoading(true)
    
    try {
      const { data, error } = await supabase.rpc('admin_get_all_recordings')
      if (error) throw error
      
      let filtered = data || []
      if (filter === 'active') {
        filtered = filtered.filter((r: RecordingWithUser) => !r.is_archived)
      } else if (filter === 'archived') {
        filtered = filtered.filter((r: RecordingWithUser) => r.is_archived)
      }
      
      setRecordings(filtered)
    } catch (err) {
      console.error('Error loading recordings:', err)
      toast.error('Failed to load recordings')
    } finally {
      setLoading(false)
    }
  }

  const handleArchiveRecording = async (recordingId: string, archive: boolean) => {
    if (!supabase) return
    
    try {
      const { error } = await supabase
        .from('recordings')
        .update({ is_archived: archive })
        .eq('id', recordingId)
      
      if (error) throw error
      
      toast.success(archive ? 'Recording archived' : 'Recording restored')
      loadRecordings()
    } catch (err) {
      console.error('Error archiving recording:', err)
      toast.error('Failed to update recording')
    }
  }

  const openRoleModal = (userItem: UserStats, newRole: string) => {
    setRoleModal({ isOpen: true, user: userItem, newRole })
  }

  const closeRoleModal = () => {
    setRoleModal({ isOpen: false, user: null, newRole: '' })
  }

  const handleChangeUserRole = async () => {
    if (!supabase || !roleModal.user) return
    
    setIsChangingRole(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: roleModal.newRole })
        .eq('id', roleModal.user.id)
      
      if (error) throw error
      toast.success(`User role changed to ${roleModal.newRole}`)
      closeRoleModal()
      // Reload to update the UI with new role
      loadUsers()
    } catch (err) {
      console.error('Error changing role:', err)
      toast.error('Failed to change user role')
      closeRoleModal()
    } finally {
      setIsChangingRole(false)
    }
  }

  const handleSignOut = async () => {
    if (supabase) {
      await supabase.auth.signOut()
    }
    router.push('/login')
  }

  // Filtered data based on search
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users
    const query = searchQuery.toLowerCase()
    return users.filter(u => 
      u.email.toLowerCase().includes(query) ||
      u.role.toLowerCase().includes(query)
    )
  }, [users, searchQuery])

  const filteredRecordings = useMemo(() => {
    if (!searchQuery.trim()) return recordings
    const query = searchQuery.toLowerCase()
    return recordings.filter(r => 
      r.file_name.toLowerCase().includes(query) ||
      r.user_email.toLowerCase().includes(query)
    )
  }, [recordings, searchQuery])

  // Stats
  const totalStorage = users.reduce((acc, u) => acc + u.total_storage_used, 0)
  const totalRecordings = users.reduce((acc, u) => acc + u.recordings_count, 0)

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatNumber = (num: number): string => {
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M'
    if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K'
    return num.toString()
  }

  const formatCost = (cost: number): string => {
    return '$' + cost.toFixed(4)
  }

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getStatusBadge = (status: string, isArchived: boolean) => {
    if (isArchived) {
      return <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-500/20 text-slate-400">Archived</span>
    }
    const configs: Record<string, { bg: string; text: string }> = {
      uploading: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
      processing: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
      done: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
      error: { bg: 'bg-red-500/20', text: 'text-red-400' },
    }
    const config = configs[status] || configs.error
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>{status}</span>
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMyMDIwMjAiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRjMC0yIDItNCAyLTRzLTItMi00LTItNCAwLTQgMiAwIDIgMiA0IDQgMiA0IDIgMC0yIDAtMnoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-20 pointer-events-none"></div>

      {/* Header */}
      <header className="relative border-b border-slate-700/50 bg-slate-900/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-3">
              <Image
                src="/Logo.svg"
                alt="RoofCoach"
                width={140}
                height={40}
                className="h-10 w-auto"
              />
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400">Admin</span>
            </Link>

            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
              >
                User Dashboard
              </Link>
              <span className="text-slate-400 text-sm hidden sm:block">{user.email}</span>
              <button
                onClick={handleSignOut}
                className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Overview */}
        {loading && activeTab === 'users' ? (
          <div className="grid sm:grid-cols-3 gap-4 mb-8">
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </div>
        ) : (
          <div className="grid sm:grid-cols-3 gap-4 mb-8">
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-slate-400 text-sm">Total Users</p>
                  <p className="text-2xl font-bold text-white">{users.length}</p>
                </div>
              </div>
            </div>
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                </div>
                <div>
                  <p className="text-slate-400 text-sm">Total Recordings</p>
                  <p className="text-2xl font-bold text-white">{totalRecordings}</p>
                </div>
              </div>
            </div>
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                  </svg>
                </div>
                <div>
                  <p className="text-slate-400 text-sm">Total Storage</p>
                  <p className="text-2xl font-bold text-white">{formatFileSize(totalStorage)}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => { setActiveTab('users'); setSearchQuery(''); }}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'users'
                ? 'bg-amber-500/20 text-amber-400'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Users
          </button>
          <button
            onClick={() => { setActiveTab('recordings'); setSearchQuery(''); }}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'recordings'
                ? 'bg-amber-500/20 text-amber-400'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Recordings
          </button>
          <button
            onClick={() => { setActiveTab('usage'); setSearchQuery(''); }}
            className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'usage'
                ? 'bg-purple-500/20 text-purple-400'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            AI Usage
          </button>
          <button
            onClick={() => { setActiveTab('prompts'); setSearchQuery(''); }}
            className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'prompts'
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Prompts
          </button>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder={activeTab === 'users' ? 'Search users...' : 'Search recordings...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Filter for recordings */}
        {activeTab === 'recordings' && (
          <div className="flex gap-2 mb-6">
            {(['all', 'active', 'archived'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filter === f
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        {activeTab === 'prompts' ? (
          promptLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Prompt Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">W4 Analysis Prompt</h2>
                  <p className="text-slate-400 text-sm">Edit the AI prompt used for W4 sales analysis</p>
                </div>
                <div className="flex items-center gap-3">
                  {hasPromptChanges && (
                    <button
                      onClick={resetPrompt}
                      className="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800"
                    >
                      Reset
                    </button>
                  )}
                  <button
                    onClick={savePrompt}
                    disabled={promptSaving || !hasPromptChanges}
                    className={`px-5 py-2 rounded-lg font-medium flex items-center gap-2 ${
                      hasPromptChanges
                        ? 'bg-gradient-to-r from-emerald-500 to-green-500 text-white hover:from-emerald-600 hover:to-green-600'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    {promptSaving ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Save
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Message */}
              {promptMessage && (
                <div className={`p-3 rounded-lg ${
                  promptMessage.type === 'success' 
                    ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400' 
                    : 'bg-red-500/20 border border-red-500/30 text-red-400'
                }`}>
                  {promptMessage.text}
                </div>
              )}

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">
                  Description (optional)
                </label>
                <input
                  type="text"
                  value={promptDescription}
                  onChange={(e) => setPromptDescription(e.target.value)}
                  placeholder="Brief description of this prompt version"
                  className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {/* Prompt Editor */}
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 bg-slate-900/50">
                  <span className="text-sm text-slate-400">Prompt Editor</span>
                  <span className="text-xs text-slate-500">
                    {prompt.length.toLocaleString()} characters
                  </span>
                </div>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="w-full h-[calc(100vh-500px)] min-h-[400px] p-4 bg-slate-950 text-slate-200 font-mono text-sm resize-none focus:outline-none"
                  spellCheck={false}
                  placeholder="Enter the W4 analysis prompt here..."
                />
              </div>

              {/* Help text */}
              <div className="p-4 bg-slate-800/30 border border-slate-700/30 rounded-lg">
                <h3 className="text-sm font-medium text-slate-300 mb-2">Tips:</h3>
                <ul className="text-xs text-slate-500 space-y-1">
                  <li>• The prompt must instruct the AI to return valid JSON</li>
                  <li>• Include all 15 checkpoints with scoring criteria</li>
                  <li>• Use specific detection criteria and red flags for consistency</li>
                  <li>• Changes take effect immediately for new analyses</li>
                  <li>• Test with a sample recording after making changes</li>
                </ul>
              </div>
            </div>
          )
        ) : activeTab === 'usage' ? (
          usageLoading ? (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 animate-pulse">
                    <div className="h-4 bg-slate-700 rounded w-24 mb-2" />
                    <div className="h-8 bg-slate-700 rounded w-16" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Platform Stats Cards */}
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-purple-500/10 to-indigo-500/10 rounded-xl border border-purple-500/20 p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                      <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-slate-400 text-sm">Total Tokens</p>
                      <p className="text-2xl font-bold text-white">{formatNumber(platformStats?.total_tokens || 0)}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-emerald-500/10 to-green-500/10 rounded-xl border border-emerald-500/20 p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                      <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-slate-400 text-sm">Estimated Cost</p>
                      <p className="text-2xl font-bold text-white">{formatCost(platformStats?.total_estimated_cost_usd || 0)}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 rounded-xl border border-amber-500/20 p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                      <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-slate-400 text-sm">Total Analyses</p>
                      <p className="text-2xl font-bold text-white">{platformStats?.total_analyses || 0}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 rounded-xl border border-blue-500/20 p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                      <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-slate-400 text-sm">Today</p>
                      <p className="text-2xl font-bold text-white">{formatNumber(platformStats?.tokens_today || 0)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Input/Output Token Breakdown */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" />
                    </svg>
                    Token Breakdown
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-400">Input Tokens</span>
                        <span className="text-white font-medium">{formatNumber(platformStats?.total_input_tokens || 0)}</span>
                      </div>
                      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full"
                          style={{ width: `${platformStats?.total_tokens ? (platformStats.total_input_tokens / platformStats.total_tokens) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-400">Output Tokens</span>
                        <span className="text-white font-medium">{formatNumber(platformStats?.total_output_tokens || 0)}</span>
                      </div>
                      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
                          style={{ width: `${platformStats?.total_tokens ? (platformStats.total_output_tokens / platformStats.total_tokens) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                    <div className="pt-2 border-t border-slate-700/50">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Avg per Analysis</span>
                        <span className="text-white font-medium">{formatNumber(platformStats?.avg_tokens_per_analysis || 0)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    Model Distribution
                  </h3>
                  <div className="space-y-3">
                    {Object.entries(modelDistribution).length > 0 ? (
                      Object.entries(modelDistribution).map(([model, count]) => (
                        <div key={model} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-gradient-to-r from-purple-500 to-pink-500" />
                            <span className="text-slate-300 text-sm font-mono">{model}</span>
                          </div>
                          <span className="text-white font-medium">{count} analyses</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-slate-500 text-center py-4">No analyses yet</p>
                    )}
                    {platformStats?.most_used_model && (
                      <div className="pt-3 border-t border-slate-700/50">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Most Used</span>
                          <span className="text-purple-400 font-mono text-sm">{platformStats.most_used_model}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Usage Chart (Simple Bar Chart) */}
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    Token Usage
                  </h3>
                  <div className="flex items-center gap-1 p-1 bg-slate-900/50 rounded-lg">
                    {([
                      { value: 'today', label: 'Today' },
                      { value: 'week', label: '7 days' },
                      { value: 'month', label: '30 days' },
                      { value: 'year', label: 'Year' },
                    ] as const).map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setChartTimeRange(option.value)}
                        className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                          chartTimeRange === option.value
                            ? 'bg-purple-500/20 text-purple-300 font-medium'
                            : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                {dailyUsage.length > 0 ? (
                  <>
                    <div className="flex items-end h-40 gap-px">
                      {dailyUsage.map((day) => {
                        const maxTokens = Math.max(...dailyUsage.map(d => d.tokens), 1)
                        const height = day.tokens > 0 ? (day.tokens / maxTokens) * 100 : 0
                        return (
                          <div 
                            key={day.date}
                            className="flex-1 min-w-[6px] group relative flex flex-col justify-end h-full"
                          >
                            <div 
                              className={`w-full rounded-t transition-colors cursor-pointer ${
                                day.tokens > 0 
                                  ? 'bg-gradient-to-t from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400' 
                                  : 'bg-slate-700/30 hover:bg-slate-600/50'
                              }`}
                              style={{ height: day.tokens > 0 ? `${Math.max(height, 8)}%` : '4px' }}
                            />
                            {/* Tooltip */}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                              <p className="font-medium">{day.date}</p>
                              <p className="text-slate-400">{formatNumber(day.tokens)} tokens</p>
                              <p className="text-slate-400">{day.analyses} {day.analyses === 1 ? 'analysis' : 'analyses'}</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div className="flex justify-between mt-2 text-xs text-slate-500">
                      <span>{dailyUsage[0]?.date}</span>
                      <span>{dailyUsage[dailyUsage.length - 1]?.date}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-40 text-slate-500">
                    <p>No usage data available</p>
                  </div>
                )}
              </div>

              {/* Per-User Token Stats */}
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 overflow-hidden">
                <div className="p-4 border-b border-slate-700/50">
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    Usage by User
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-900/50">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">User</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-slate-400">Analyses</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-slate-400">Input</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-slate-400">Output</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-slate-400">Total</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-slate-400">Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {userTokenStats.length > 0 ? (
                        userTokenStats.map((u) => (
                          <tr key={u.user_id} className="hover:bg-slate-800/50">
                            <td className="px-4 py-3">
                              <p className="text-white font-medium">{u.user_email}</p>
                              {u.last_analysis_at && (
                                <p className="text-slate-500 text-xs">Last: {formatDate(u.last_analysis_at)}</p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-slate-300">{u.total_analyses}</td>
                            <td className="px-4 py-3 text-right text-blue-400 font-mono text-sm">{formatNumber(u.total_input_tokens)}</td>
                            <td className="px-4 py-3 text-right text-purple-400 font-mono text-sm">{formatNumber(u.total_output_tokens)}</td>
                            <td className="px-4 py-3 text-right text-white font-medium">{formatNumber(u.total_tokens)}</td>
                            <td className="px-4 py-3 text-right text-emerald-400 font-mono text-sm">{formatCost(u.estimated_cost_usd)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                            No usage data yet
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )
        ) : loading ? (
          activeTab === 'users' ? (
            <UserTableSkeleton rows={5} />
          ) : (
            <RecordingListSkeleton count={5} />
          )
        ) : activeTab === 'users' ? (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-900/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">User</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">Role</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">Recordings</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">Storage</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">Joined</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {filteredUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-800/50">
                        <td className="px-4 py-3">
                          <p className="text-white font-medium">{u.email}</p>
                          <p className="text-slate-500 text-xs font-mono">{u.id.slice(0, 8)}...</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            u.role === 'admin' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'
                          }`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-300">{u.recordings_count}</td>
                        <td className="px-4 py-3 text-slate-300">{formatFileSize(u.total_storage_used)}</td>
                        <td className="px-4 py-3 text-slate-400 text-sm">{formatDate(u.created_at)}</td>
                        <td className="px-4 py-3">
                          <select
                            key={`${u.id}-${u.role}`}
                            defaultValue={u.role}
                            onChange={(e) => {
                              const newRole = e.target.value
                              if (newRole !== u.role) {
                                openRoleModal(u, newRole)
                                // Reset select to original value
                                e.target.value = u.role
                              }
                            }}
                            className="bg-slate-700 text-white text-sm rounded-lg px-2 py-1 border border-slate-600 cursor-pointer"
                            disabled={u.id === user.id}
                          >
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-4">
              {filteredUsers.map((u) => (
                <div key={u.id} className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-white font-medium">{u.email}</p>
                      <p className="text-slate-500 text-xs font-mono">{u.id.slice(0, 8)}...</p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      u.role === 'admin' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'
                    }`}>
                      {u.role}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                    <div>
                      <p className="text-slate-400">Recordings</p>
                      <p className="text-white font-medium">{u.recordings_count}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Storage</p>
                      <p className="text-white font-medium">{formatFileSize(u.total_storage_used)}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-slate-700/50">
                    <p className="text-slate-500 text-sm">Joined {formatDate(u.created_at)}</p>
                    <select
                      key={`mobile-${u.id}-${u.role}`}
                      defaultValue={u.role}
                      onChange={(e) => {
                        const newRole = e.target.value
                        if (newRole !== u.role) {
                          openRoleModal(u, newRole)
                          // Reset select to original value
                          e.target.value = u.role
                        }
                      }}
                      className="bg-slate-700 text-white text-sm rounded-lg px-2 py-1 border border-slate-600"
                      disabled={u.id === user.id}
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>

            {filteredUsers.length === 0 && (
              <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-12 text-center">
                <p className="text-slate-400">No users found</p>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-4">
            {filteredRecordings.length === 0 ? (
              <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-12 text-center">
                <div className="w-16 h-16 mx-auto rounded-full bg-slate-700/50 flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                </div>
                <p className="text-slate-400">No recordings found</p>
              </div>
            ) : (
              filteredRecordings.map((recording) => (
                <div
                  key={recording.id}
                  className={`bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-4 ${
                    recording.is_archived ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
                      <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-white font-medium truncate">{recording.file_name}</h3>
                        {getStatusBadge(recording.status, recording.is_archived)}
                        {recording.has_transcript && (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400">
                            Transcribed
                          </span>
                        )}
                      </div>
                      <p className="text-slate-400 text-sm mt-1">
                        <span className="text-amber-400">{recording.user_email}</span>
                        {' • '}{formatFileSize(recording.file_size)} 
                        {' • '}{formatDate(recording.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <Link
                        href={`/dashboard/recordings/${recording.id}`}
                        className="p-2 text-slate-400 hover:text-white transition-colors"
                        title="View"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </Link>
                      <button
                        onClick={() => handleArchiveRecording(recording.id, !recording.is_archived)}
                        className={`p-2 transition-colors ${
                          recording.is_archived
                            ? 'text-emerald-400 hover:text-emerald-300'
                            : 'text-slate-400 hover:text-amber-400'
                        }`}
                        title={recording.is_archived ? 'Restore' : 'Archive'}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {/* Role Change Confirmation Modal */}
      <ConfirmModal
        isOpen={roleModal.isOpen}
        onClose={closeRoleModal}
        onConfirm={handleChangeUserRole}
        title="Change User Role"
        message={`Are you sure you want to change ${roleModal.user?.email}'s role to ${roleModal.newRole}?`}
        confirmText="Change Role"
        cancelText="Cancel"
        variant="warning"
        loading={isChangingRole}
      />
    </div>
  )
}

