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

type Tab = 'users' | 'recordings'

export default function AdminDashboard({ user }: { user: User }) {
  const [activeTab, setActiveTab] = useState<Tab>('users')
  const [users, setUsers] = useState<UserStats[]>([])
  const [recordings, setRecordings] = useState<RecordingWithUser[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'active' | 'archived'>('active')
  const [searchQuery, setSearchQuery] = useState('')
  
  // Role change modal
  const [roleModal, setRoleModal] = useState<{ isOpen: boolean; user: UserStats | null; newRole: string }>({
    isOpen: false,
    user: null,
    newRole: '',
  })
  const [isChangingRole, setIsChangingRole] = useState(false)
  
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
    } else {
      loadRecordings()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, filter])

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
      loadUsers()
    } catch (err) {
      console.error('Error changing role:', err)
      toast.error('Failed to change user role')
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
        {loading ? (
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
                            value={u.role}
                            onChange={(e) => openRoleModal(u, e.target.value)}
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
                      value={u.role}
                      onChange={(e) => openRoleModal(u, e.target.value)}
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

