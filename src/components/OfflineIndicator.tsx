'use client'

import { useOfflineStatus } from '@/hooks/useOfflineStatus'
import { formatFileSize } from '@/lib/offlineStorage'

interface Props {
  userId: string | undefined
}

export function OfflineIndicator({ userId }: Props) {
  const { 
    isOnline, 
    pendingCount, 
    pendingRecordings, 
    syncStatus, 
    syncNow 
  } = useOfflineStatus(userId)
  
  // Don't show anything if online and no pending
  if (isOnline && pendingCount === 0 && !syncStatus?.isSyncing) {
    return null
  }
  
  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      {/* Offline Banner */}
      {!isOnline && (
        <div className="bg-amber-500/90 text-amber-950 px-4 py-3 rounded-xl shadow-lg mb-2 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3" />
            </svg>
            <div>
              <p className="font-semibold">You&apos;re offline</p>
              <p className="text-sm opacity-80">Recordings will be saved locally</p>
            </div>
          </div>
        </div>
      )}
      
      {/* Syncing Progress */}
      {syncStatus?.isSyncing && (
        <div className="bg-blue-500/90 text-white px-4 py-3 rounded-xl shadow-lg mb-2 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <div className="flex-1">
              <p className="font-semibold">Syncing recordings...</p>
              <p className="text-sm opacity-80">
                {syncStatus.completedItems} / {syncStatus.totalItems}
              </p>
              <div className="w-full bg-blue-400/30 rounded-full h-1.5 mt-2">
                <div 
                  className="bg-white h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${syncStatus.progress}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Pending Uploads */}
      {pendingCount > 0 && isOnline && !syncStatus?.isSyncing && (
        <div className="bg-gray-800/95 text-white px-4 py-3 rounded-xl shadow-lg backdrop-blur-sm border border-gray-700">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-amber-500/20 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div>
                <p className="font-semibold">{pendingCount} pending upload{pendingCount > 1 ? 's' : ''}</p>
                <p className="text-sm text-gray-400">
                  {formatFileSize(pendingRecordings.reduce((sum, r) => sum + r.fileSize, 0))} total
                </p>
              </div>
            </div>
            <button
              onClick={syncNow}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-amber-950 text-sm font-medium rounded-lg transition-colors"
            >
              Sync Now
            </button>
          </div>
          
          {/* List of pending files */}
          {pendingRecordings.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-700 space-y-2 max-h-32 overflow-y-auto">
              {pendingRecordings.slice(0, 5).map((recording) => (
                <div key={recording.id} className="flex items-center gap-2 text-sm">
                  <span className={`w-2 h-2 rounded-full ${
                    recording.status === 'pending' ? 'bg-amber-400' :
                    recording.status === 'uploading' ? 'bg-blue-400 animate-pulse' :
                    'bg-red-400'
                  }`} />
                  <span className="truncate flex-1 text-gray-300">{recording.fileName}</span>
                  <span className="text-gray-500">{formatFileSize(recording.fileSize)}</span>
                </div>
              ))}
              {pendingRecordings.length > 5 && (
                <p className="text-xs text-gray-500">+{pendingRecordings.length - 5} more</p>
              )}
            </div>
          )}
        </div>
      )}
      
      {/* Sync Error */}
      {syncStatus?.error && !syncStatus.isSyncing && (
        <div className="bg-red-500/90 text-white px-4 py-3 rounded-xl shadow-lg mt-2 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="font-semibold">Sync failed</p>
              <p className="text-sm opacity-80">{syncStatus.error}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

