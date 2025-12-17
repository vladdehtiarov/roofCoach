'use client'

import { useState, useEffect, useCallback } from 'react'
import { 
  getPendingRecordings, 
  getPendingCount,
  initOfflineDB,
  PendingRecording 
} from '@/lib/offlineStorage'
import { 
  syncPendingRecordings, 
  onSyncStatus, 
  setupAutoSync,
  SyncStatus 
} from '@/lib/syncService'

export interface OfflineStatus {
  isOnline: boolean
  pendingCount: number
  pendingRecordings: PendingRecording[]
  syncStatus: SyncStatus | null
  syncNow: () => Promise<void>
  refreshPending: () => Promise<void>
}

export function useOfflineStatus(userId: string | undefined): OfflineStatus {
  const [isOnline, setIsOnline] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)
  const [pendingRecordings, setPendingRecordings] = useState<PendingRecording[]>([])
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  
  // Initialize and refresh pending recordings
  const refreshPending = useCallback(async () => {
    if (!userId) return
    
    try {
      await initOfflineDB()
      const recordings = await getPendingRecordings(userId)
      setPendingRecordings(recordings)
      setPendingCount(recordings.filter(r => r.status === 'pending').length)
    } catch (error) {
      console.error('Failed to refresh pending recordings:', error)
    }
  }, [userId])
  
  // Manual sync trigger
  const syncNow = useCallback(async () => {
    if (!userId || !isOnline) return
    await syncPendingRecordings(userId)
    await refreshPending()
  }, [userId, isOnline, refreshPending])
  
  // Setup online/offline listeners
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    setIsOnline(navigator.onLine)
    
    const handleOnline = () => {
      setIsOnline(true)
      // Auto-sync when coming online
      if (userId) {
        syncPendingRecordings(userId).then(() => refreshPending())
      }
    }
    
    const handleOffline = () => {
      setIsOnline(false)
    }
    
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [userId, refreshPending])
  
  // Subscribe to sync status
  useEffect(() => {
    const unsubscribe = onSyncStatus((status) => {
      setSyncStatus(status)
      // Refresh pending list when sync completes
      if (!status.isSyncing && userId) {
        refreshPending()
      }
    })
    
    return unsubscribe
  }, [userId, refreshPending])
  
  // Initial load
  useEffect(() => {
    refreshPending()
  }, [refreshPending])
  
  // Setup auto-sync
  useEffect(() => {
    if (!userId) return
    const cleanup = setupAutoSync(userId)
    return cleanup
  }, [userId])
  
  return {
    isOnline,
    pendingCount,
    pendingRecordings,
    syncStatus,
    syncNow,
    refreshPending,
  }
}

