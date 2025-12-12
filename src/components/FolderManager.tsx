'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Folder, FolderInsert } from '@/types/database'
import { useToast } from '@/components/ui/Toast'

interface FolderManagerProps {
  userId: string
  selectedFolderId?: string | null
  onFolderChange?: (folderId: string | null) => void
  recordingCount?: Record<string, number> // folderId -> count
}

const FOLDER_COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#3b82f6', // blue
  '#14b8a6', // teal
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#ec4899', // pink
]

const FOLDER_ICONS = [
  'folder',
  'star',
  'heart',
  'bookmark',
  'briefcase',
  'archive',
  'music',
  'mic',
]

export default function FolderManager({
  userId,
  selectedFolderId,
  onFolderChange,
  recordingCount = {},
}: FolderManagerProps) {
  const [folders, setFolders] = useState<Folder[]>([])
  const [loading, setLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderColor, setNewFolderColor] = useState(FOLDER_COLORS[0])
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null)
  
  const inputRef = useRef<HTMLInputElement>(null)
  const toast = useToast()
  const supabase = createClient()

  useEffect(() => {
    loadFolders()
  }, [userId])

  useEffect(() => {
    if (showCreateForm && inputRef.current) {
      inputRef.current.focus()
    }
  }, [showCreateForm])

  const loadFolders = async () => {
    try {
      const { data, error } = await supabase
        .from('folders')
        .select('*')
        .eq('user_id', userId)
        .order('name')

      if (error) throw error
      setFolders(data || [])
    } catch (err) {
      console.error('Error loading folders:', err)
    } finally {
      setLoading(false)
    }
  }

  const createFolder = async () => {
    if (!newFolderName.trim()) return

    setIsCreating(true)
    try {
      const folderInsert: FolderInsert = {
        user_id: userId,
        name: newFolderName.trim(),
        color: newFolderColor,
      }

      const { data, error } = await supabase
        .from('folders')
        .insert(folderInsert)
        .select()
        .single()

      if (error) {
        if (error.code === '23505') {
          toast.error('Folder already exists')
        } else {
          throw error
        }
        return
      }

      setFolders([...folders, data])
      setNewFolderName('')
      setShowCreateForm(false)
      toast.success(`Folder "${data.name}" created`)
    } catch (err) {
      console.error('Error creating folder:', err)
      toast.error('Failed to create folder')
    } finally {
      setIsCreating(false)
    }
  }

  const deleteFolder = async (folderId: string) => {
    try {
      const { error } = await supabase
        .from('folders')
        .delete()
        .eq('id', folderId)

      if (error) throw error

      setFolders(folders.filter(f => f.id !== folderId))
      if (selectedFolderId === folderId && onFolderChange) {
        onFolderChange(null)
      }
      toast.success('Folder deleted')
    } catch (err) {
      console.error('Error deleting folder:', err)
      toast.error('Failed to delete folder')
    }
  }

  const renameFolder = async (folderId: string, newName: string) => {
    if (!newName.trim()) return

    try {
      const { error } = await supabase
        .from('folders')
        .update({ name: newName.trim() })
        .eq('id', folderId)

      if (error) throw error

      setFolders(folders.map(f => f.id === folderId ? { ...f, name: newName.trim() } : f))
      setEditingFolder(null)
      toast.success('Folder renamed')
    } catch (err) {
      console.error('Error renaming folder:', err)
      toast.error('Failed to rename folder')
    }
  }

  const getFolderIcon = (iconName: string) => {
    switch (iconName) {
      case 'star':
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        )
      case 'heart':
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
          </svg>
        )
      case 'bookmark':
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
          </svg>
        )
      case 'briefcase':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        )
      case 'archive':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
        )
      case 'music':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
        )
      case 'mic':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        )
      default:
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        )
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-10 bg-slate-700/50 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* All Recordings option */}
      <button
        onClick={() => onFolderChange?.(null)}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
          selectedFolderId === null
            ? 'bg-slate-700 text-white'
            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
        <span className="flex-1 text-left text-sm">All Recordings</span>
      </button>

      {/* Folders list */}
      {folders.map(folder => (
        <div
          key={folder.id}
          className={`group flex items-center gap-2 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
            selectedFolderId === folder.id
              ? 'bg-slate-700 text-white'
              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
          }`}
          onClick={() => onFolderChange?.(folder.id)}
        >
          <span style={{ color: folder.color }}>
            {getFolderIcon(folder.icon)}
          </span>
          
          {editingFolder?.id === folder.id ? (
            <input
              type="text"
              defaultValue={folder.name}
              onBlur={(e) => renameFolder(folder.id, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  renameFolder(folder.id, e.currentTarget.value)
                } else if (e.key === 'Escape') {
                  setEditingFolder(null)
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 bg-slate-600 rounded px-1 py-0.5 text-sm text-white focus:outline-none"
              autoFocus
            />
          ) : (
            <span className="flex-1 text-left text-sm truncate">{folder.name}</span>
          )}

          {recordingCount[folder.id] !== undefined && (
            <span className="text-xs text-slate-500">
              {recordingCount[folder.id]}
            </span>
          )}

          {/* Actions */}
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setEditingFolder(folder)
              }}
              className="p-1 hover:text-blue-400 transition-colors"
              title="Rename"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (confirm(`Delete folder "${folder.name}"? Recordings will be moved to "All".`)) {
                  deleteFolder(folder.id)
                }
              }}
              className="p-1 hover:text-red-400 transition-colors"
              title="Delete"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      ))}

      {/* Create folder form */}
      {showCreateForm ? (
        <div className="flex items-center gap-2 px-2 py-2 bg-slate-800/50 rounded-lg border border-slate-700/50">
          <button
            onClick={() => {
              const nextColor = FOLDER_COLORS[(FOLDER_COLORS.indexOf(newFolderColor) + 1) % FOLDER_COLORS.length]
              setNewFolderColor(nextColor)
            }}
            className="p-1 rounded hover:bg-slate-700 transition-colors"
            style={{ color: newFolderColor }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </button>
          <input
            ref={inputRef}
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newFolderName.trim()) {
                createFolder()
              } else if (e.key === 'Escape') {
                setShowCreateForm(false)
                setNewFolderName('')
              }
            }}
            placeholder="Folder name..."
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
          />
          <button
            onClick={createFolder}
            disabled={!newFolderName.trim() || isCreating}
            className="p-1 text-emerald-400 hover:text-emerald-300 disabled:opacity-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </button>
          <button
            onClick={() => {
              setShowCreateForm(false)
              setNewFolderName('')
            }}
            className="p-1 text-slate-400 hover:text-slate-300 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowCreateForm(true)}
          className="w-full flex items-center gap-2 px-3 py-2 text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          <span className="text-sm">New Folder</span>
        </button>
      )}
    </div>
  )
}

