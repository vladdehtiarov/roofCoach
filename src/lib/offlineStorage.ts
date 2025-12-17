// Offline storage using IndexedDB for audio recordings
// Allows recording without internet and syncing later

const DB_NAME = 'repfuel-offline'
const DB_VERSION = 1
const STORE_NAME = 'pending-recordings'

export interface PendingRecording {
  id: string
  fileName: string
  fileSize: number
  mimeType: string
  audioBlob: Blob
  createdAt: string
  userId: string
  status: 'pending' | 'uploading' | 'error'
  errorMessage?: string
  retryCount: number
}

let db: IDBDatabase | null = null

// Initialize IndexedDB
export async function initOfflineDB(): Promise<IDBDatabase> {
  if (db) return db
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    
    request.onerror = () => {
      console.error('❌ Failed to open IndexedDB:', request.error)
      reject(request.error)
    }
    
    request.onsuccess = () => {
      db = request.result
      console.log('✅ IndexedDB initialized')
      resolve(db)
    }
    
    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result
      
      // Create object store for pending recordings
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('status', 'status', { unique: false })
        store.createIndex('createdAt', 'createdAt', { unique: false })
        store.createIndex('userId', 'userId', { unique: false })
        console.log('📦 Created pending-recordings store')
      }
    }
  })
}

// Save recording to IndexedDB (when offline)
export async function saveRecordingOffline(recording: Omit<PendingRecording, 'status' | 'retryCount'>): Promise<string> {
  const database = await initOfflineDB()
  
  const pendingRecording: PendingRecording = {
    ...recording,
    status: 'pending',
    retryCount: 0,
  }
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.add(pendingRecording)
    
    request.onsuccess = () => {
      console.log('💾 Recording saved offline:', recording.id)
      resolve(recording.id)
    }
    
    request.onerror = () => {
      console.error('❌ Failed to save recording offline:', request.error)
      reject(request.error)
    }
  })
}

// Get all pending recordings
export async function getPendingRecordings(userId?: string): Promise<PendingRecording[]> {
  const database = await initOfflineDB()
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.getAll()
    
    request.onsuccess = () => {
      let recordings = request.result as PendingRecording[]
      if (userId) {
        recordings = recordings.filter(r => r.userId === userId)
      }
      resolve(recordings)
    }
    
    request.onerror = () => {
      console.error('❌ Failed to get pending recordings:', request.error)
      reject(request.error)
    }
  })
}

// Get single pending recording
export async function getPendingRecording(id: string): Promise<PendingRecording | null> {
  const database = await initOfflineDB()
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(id)
    
    request.onsuccess = () => {
      resolve(request.result || null)
    }
    
    request.onerror = () => {
      reject(request.error)
    }
  })
}

// Update recording status
export async function updateRecordingStatus(
  id: string, 
  status: PendingRecording['status'],
  errorMessage?: string
): Promise<void> {
  const database = await initOfflineDB()
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const getRequest = store.get(id)
    
    getRequest.onsuccess = () => {
      const recording = getRequest.result as PendingRecording
      if (!recording) {
        reject(new Error('Recording not found'))
        return
      }
      
      recording.status = status
      if (errorMessage) {
        recording.errorMessage = errorMessage
        recording.retryCount += 1
      }
      
      const putRequest = store.put(recording)
      putRequest.onsuccess = () => resolve()
      putRequest.onerror = () => reject(putRequest.error)
    }
    
    getRequest.onerror = () => reject(getRequest.error)
  })
}

// Delete recording from IndexedDB (after successful upload)
export async function deleteOfflineRecording(id: string): Promise<void> {
  const database = await initOfflineDB()
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.delete(id)
    
    request.onsuccess = () => {
      console.log('🗑️ Deleted offline recording:', id)
      resolve()
    }
    
    request.onerror = () => {
      console.error('❌ Failed to delete offline recording:', request.error)
      reject(request.error)
    }
  })
}

// Get count of pending recordings
export async function getPendingCount(userId?: string): Promise<number> {
  const recordings = await getPendingRecordings(userId)
  return recordings.filter(r => r.status === 'pending').length
}

// Get total size of pending recordings
export async function getPendingSize(userId?: string): Promise<number> {
  const recordings = await getPendingRecordings(userId)
  return recordings.reduce((sum, r) => sum + r.fileSize, 0)
}

// Check if we're online
export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true
}

// Format file size
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// Generate unique ID for offline recording
export function generateOfflineId(): string {
  return `offline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

