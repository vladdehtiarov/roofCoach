'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Bookmark, BookmarkInsert } from '@/types/database'
import { useToast } from '@/components/ui/Toast'

interface BookmarkManagerProps {
  recordingId: string
  userId: string
  currentTime?: number // Current audio position in seconds
  onSeek?: (seconds: number) => void
}

const BOOKMARK_COLORS = [
  '#f59e0b', // amber
  '#ef4444', // red
  '#10b981', // emerald
  '#3b82f6', // blue
  '#8b5cf6', // violet
]

export default function BookmarkManager({
  recordingId,
  userId,
  currentTime = 0,
  onSeek,
}: BookmarkManagerProps) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [loading, setLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newNote, setNewNote] = useState('')
  const [newColor, setNewColor] = useState(BOOKMARK_COLORS[0])
  const [editingId, setEditingId] = useState<string | null>(null)
  
  const toast = useToast()
  const supabase = createClient()

  useEffect(() => {
    loadBookmarks()
  }, [recordingId])

  const loadBookmarks = async () => {
    try {
      const { data, error } = await supabase
        .from('bookmarks')
        .select('*')
        .eq('recording_id', recordingId)
        .order('timestamp_seconds')

      if (error) throw error
      setBookmarks(data || [])
    } catch (err) {
      console.error('Error loading bookmarks:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const createBookmark = async () => {
    if (!newTitle.trim()) {
      toast.error('Please enter a title')
      return
    }

    setIsCreating(true)
    try {
      const bookmarkInsert: BookmarkInsert = {
        recording_id: recordingId,
        user_id: userId,
        timestamp_seconds: Math.floor(currentTime),
        title: newTitle.trim(),
        note: newNote.trim() || null,
        color: newColor,
      }

      const { data, error } = await supabase
        .from('bookmarks')
        .insert(bookmarkInsert)
        .select()
        .single()

      if (error) throw error

      setBookmarks([...bookmarks, data].sort((a, b) => a.timestamp_seconds - b.timestamp_seconds))
      setNewTitle('')
      setNewNote('')
      setShowForm(false)
      toast.success('Bookmark added')
    } catch (err) {
      console.error('Error creating bookmark:', err)
      toast.error('Failed to create bookmark')
    } finally {
      setIsCreating(false)
    }
  }

  const updateBookmark = async (id: string, updates: Partial<Bookmark>) => {
    try {
      const { error } = await supabase
        .from('bookmarks')
        .update(updates)
        .eq('id', id)

      if (error) throw error

      setBookmarks(bookmarks.map(b => b.id === id ? { ...b, ...updates } : b))
      setEditingId(null)
      toast.success('Bookmark updated')
    } catch (err) {
      console.error('Error updating bookmark:', err)
      toast.error('Failed to update bookmark')
    }
  }

  const deleteBookmark = async (id: string) => {
    try {
      const { error } = await supabase
        .from('bookmarks')
        .delete()
        .eq('id', id)

      if (error) throw error

      setBookmarks(bookmarks.filter(b => b.id !== id))
      toast.success('Bookmark deleted')
    } catch (err) {
      console.error('Error deleting bookmark:', err)
      toast.error('Failed to delete bookmark')
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2].map(i => (
          <div key={i} className="h-12 bg-slate-700/50 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header with add button */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
            <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
          </svg>
          Bookmarks
          {bookmarks.length > 0 && (
            <span className="text-xs text-slate-500">({bookmarks.length})</span>
          )}
        </h3>
        
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Add at {formatTime(currentTime)}
          </button>
        )}
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-purple-400 px-2 py-1 bg-purple-500/20 rounded">
              {formatTime(currentTime)}
            </span>
            
            {/* Color picker */}
            <div className="flex gap-1">
              {BOOKMARK_COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => setNewColor(color)}
                  className={`w-4 h-4 rounded-full transition-transform ${
                    newColor === color ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-800 scale-110' : ''
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
          
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Bookmark title..."
            className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-1.5 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-slate-500"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') createBookmark()
              if (e.key === 'Escape') setShowForm(false)
            }}
          />
          
          <textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Note (optional)..."
            rows={2}
            className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-1.5 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-slate-500 resize-none"
          />
          
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1 text-sm text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={createBookmark}
              disabled={!newTitle.trim() || isCreating}
              className="px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded text-sm font-medium hover:bg-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isCreating ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Bookmarks list */}
      {bookmarks.length === 0 && !showForm ? (
        <p className="text-sm text-slate-500 text-center py-4">
          No bookmarks yet. Add one to mark important moments.
        </p>
      ) : (
        <div className="space-y-2">
          {bookmarks.map(bookmark => (
            <div
              key={bookmark.id}
              className="group flex items-start gap-3 p-2 rounded-lg hover:bg-slate-800/50 transition-colors cursor-pointer"
              onClick={() => onSeek?.(bookmark.timestamp_seconds)}
            >
              {/* Color indicator */}
              <div 
                className="w-1 h-full min-h-[2rem] rounded-full flex-shrink-0"
                style={{ backgroundColor: bookmark.color }}
              />
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onSeek?.(bookmark.timestamp_seconds)
                    }}
                    className="text-xs font-mono text-purple-400 hover:text-purple-300 px-1.5 py-0.5 bg-purple-500/20 rounded transition-colors"
                  >
                    ▶ {formatTime(bookmark.timestamp_seconds)}
                  </button>
                  
                  {editingId === bookmark.id ? (
                    <input
                      type="text"
                      defaultValue={bookmark.title}
                      onBlur={(e) => updateBookmark(bookmark.id, { title: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          updateBookmark(bookmark.id, { title: e.currentTarget.value })
                        } else if (e.key === 'Escape') {
                          setEditingId(null)
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 bg-slate-700 rounded px-2 py-0.5 text-sm text-white focus:outline-none"
                      autoFocus
                    />
                  ) : (
                    <span className="text-sm text-white truncate">{bookmark.title}</span>
                  )}
                </div>
                
                {bookmark.note && (
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">{bookmark.note}</p>
                )}
              </div>

              {/* Actions */}
              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditingId(bookmark.id)
                  }}
                  className="p-1 text-slate-400 hover:text-blue-400 transition-colors"
                  title="Edit"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm('Delete this bookmark?')) {
                      deleteBookmark(bookmark.id)
                    }
                  }}
                  className="p-1 text-slate-400 hover:text-red-400 transition-colors"
                  title="Delete"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

