// Sync service - uploads pending recordings when online
import { createClient } from '@/lib/supabase/client'
import { 
  getPendingRecordings, 
  updateRecordingStatus, 
  deleteOfflineRecording,
  PendingRecording,
  isOnline
} from './offlineStorage'

type SyncCallback = (status: SyncStatus) => void

export interface SyncStatus {
  isSyncing: boolean
  currentItem: string | null
  progress: number // 0-100
  totalItems: number
  completedItems: number
  error: string | null
}

let syncInProgress = false
let syncCallbacks: SyncCallback[] = []

// Subscribe to sync status updates
export function onSyncStatus(callback: SyncCallback): () => void {
  syncCallbacks.push(callback)
  return () => {
    syncCallbacks = syncCallbacks.filter(cb => cb !== callback)
  }
}

// Notify all subscribers
function notifyStatus(status: SyncStatus) {
  syncCallbacks.forEach(cb => cb(status))
}

// Main sync function - call this when coming online
export async function syncPendingRecordings(userId: string): Promise<{ success: number; failed: number }> {
  if (syncInProgress) {
    console.log('⏳ Sync already in progress')
    return { success: 0, failed: 0 }
  }
  
  if (!isOnline()) {
    console.log('📵 Cannot sync - offline')
    return { success: 0, failed: 0 }
  }
  
  syncInProgress = true
  let success = 0
  let failed = 0
  
  try {
    const pending = await getPendingRecordings(userId)
    const toSync = pending.filter(r => r.status === 'pending' || (r.status === 'error' && r.retryCount < 3))
    
    if (toSync.length === 0) {
      console.log('✅ No recordings to sync')
      syncInProgress = false
      return { success: 0, failed: 0 }
    }
    
    console.log(`🔄 Starting sync of ${toSync.length} recordings...`)
    
    notifyStatus({
      isSyncing: true,
      currentItem: null,
      progress: 0,
      totalItems: toSync.length,
      completedItems: 0,
      error: null,
    })
    
    for (let i = 0; i < toSync.length; i++) {
      const recording = toSync[i]
      
      notifyStatus({
        isSyncing: true,
        currentItem: recording.fileName,
        progress: Math.round((i / toSync.length) * 100),
        totalItems: toSync.length,
        completedItems: i,
        error: null,
      })
      
      try {
        await uploadPendingRecording(recording)
        await deleteOfflineRecording(recording.id)
        success++
        console.log(`✅ Synced: ${recording.fileName}`)
      } catch (error) {
        failed++
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        await updateRecordingStatus(recording.id, 'error', errorMsg)
        console.error(`❌ Failed to sync: ${recording.fileName}`, error)
      }
    }
    
    notifyStatus({
      isSyncing: false,
      currentItem: null,
      progress: 100,
      totalItems: toSync.length,
      completedItems: toSync.length,
      error: failed > 0 ? `${failed} recording(s) failed to sync` : null,
    })
    
    console.log(`🔄 Sync complete: ${success} success, ${failed} failed`)
    
  } catch (error) {
    console.error('❌ Sync error:', error)
    notifyStatus({
      isSyncing: false,
      currentItem: null,
      progress: 0,
      totalItems: 0,
      completedItems: 0,
      error: error instanceof Error ? error.message : 'Sync failed',
    })
  } finally {
    syncInProgress = false
  }
  
  return { success, failed }
}

// Upload a single pending recording to Supabase
async function uploadPendingRecording(recording: PendingRecording): Promise<void> {
  const supabase = createClient()
  
  // Update status to uploading
  await updateRecordingStatus(recording.id, 'uploading')
  
  // Generate unique file path
  const timestamp = Date.now()
  const safeName = recording.fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
  const filePath = `${recording.userId}/${timestamp}-${safeName}`
  
  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from('recordings')
    .upload(filePath, recording.audioBlob, {
      contentType: recording.mimeType,
      upsert: false,
    })
  
  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`)
  }
  
  // Create recording record in database
  const { error: dbError } = await supabase.from('recordings').insert({
    user_id: recording.userId,
    file_path: filePath,
    file_name: recording.fileName,
    file_size: recording.fileSize,
    status: 'done',
    is_archived: false,
  })
  
  if (dbError) {
    // Try to delete the uploaded file if DB insert failed
    await supabase.storage.from('recordings').remove([filePath])
    throw new Error(`Database error: ${dbError.message}`)
  }
}

// Check if there are pending recordings
export async function hasPendingRecordings(userId: string): Promise<boolean> {
  const pending = await getPendingRecordings(userId)
  return pending.some(r => r.status === 'pending' || r.status === 'error')
}

// Setup automatic sync when coming online
export function setupAutoSync(userId: string) {
  if (typeof window === 'undefined') return
  
  const handleOnline = () => {
    console.log('🌐 Back online - starting sync...')
    syncPendingRecordings(userId)
  }
  
  window.addEventListener('online', handleOnline)
  
  // Return cleanup function
  return () => {
    window.removeEventListener('online', handleOnline)
  }
}

