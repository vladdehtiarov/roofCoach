'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Comment, CommentInsert } from '@/types/database'
import { useToast } from '@/components/ui/Toast'
import { ConfirmModal } from '@/components/ui/Modal'

interface CommentsManagerProps {
  recordingId: string
  userId: string
  onSeek?: (seconds: number) => void
  currentTime?: number
}

export default function CommentsManager({ 
  recordingId, 
  userId, 
  onSeek,
  currentTime = 0 
}: CommentsManagerProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [linkToTimestamp, setLinkToTimestamp] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; comment: Comment | null }>({
    isOpen: false,
    comment: null
  })
  const [isDeleting, setIsDeleting] = useState(false)
  const toast = useToast()
  const supabase = createClient()

  useEffect(() => {
    loadComments()
  }, [recordingId])

  const loadComments = async () => {
    try {
      const { data, error } = await supabase
        .from('comments')
        .select('*')
        .eq('recording_id', recordingId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setComments(data || [])
    } catch (err) {
      console.error('Error loading comments:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newComment.trim()) return

    setIsSubmitting(true)
    try {
      const commentData: CommentInsert = {
        recording_id: recordingId,
        user_id: userId,
        content: newComment.trim(),
        timestamp_seconds: linkToTimestamp ? Math.floor(currentTime) : null,
      }

      const { data, error } = await supabase
        .from('comments')
        .insert(commentData)
        .select()
        .single()

      if (error) throw error

      setComments([data, ...comments])
      setNewComment('')
      setLinkToTimestamp(false)
      toast.success('Comment added')
    } catch (err) {
      console.error('Error adding comment:', err)
      toast.error('Failed to add comment')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUpdate = async (commentId: string) => {
    if (!editingContent.trim()) return

    try {
      const { error } = await supabase
        .from('comments')
        .update({ content: editingContent.trim(), updated_at: new Date().toISOString() })
        .eq('id', commentId)

      if (error) throw error

      setComments(comments.map(c => 
        c.id === commentId ? { ...c, content: editingContent.trim() } : c
      ))
      setEditingId(null)
      setEditingContent('')
      toast.success('Comment updated')
    } catch (err) {
      console.error('Error updating comment:', err)
      toast.error('Failed to update comment')
    }
  }

  const openDeleteModal = (comment: Comment) => {
    setDeleteModal({ isOpen: true, comment })
  }

  const closeDeleteModal = () => {
    setDeleteModal({ isOpen: false, comment: null })
  }

  const handleDelete = async () => {
    if (!deleteModal.comment) return

    setIsDeleting(true)
    try {
      const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', deleteModal.comment.id)

      if (error) throw error

      setComments(comments.filter(c => c.id !== deleteModal.comment?.id))
      toast.success('Comment deleted')
      closeDeleteModal()
    } catch (err) {
      console.error('Error deleting comment:', err)
      toast.error('Failed to delete comment')
    } finally {
      setIsDeleting(false)
    }
  }

  const formatTimestamp = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    })
  }

  const startEdit = (comment: Comment) => {
    setEditingId(comment.id)
    setEditingContent(comment.content)
  }

  return (
    <div className="bg-slate-800/30 rounded-xl border border-slate-700/50 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
          <h3 className="text-white font-medium">Notes & Comments</h3>
          <span className="text-slate-500 text-sm">({comments.length})</span>
        </div>
      </div>

      {/* Add Comment Form */}
      <form onSubmit={handleSubmit} className="p-4 border-b border-slate-700/50">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a note or comment..."
          rows={2}
          className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent resize-none text-sm"
        />
        <div className="flex items-center justify-between mt-2">
          <label className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={linkToTimestamp}
              onChange={(e) => setLinkToTimestamp(e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 bg-slate-900/50 text-blue-500 focus:ring-blue-500/50"
            />
            <span className="text-slate-400 text-sm group-hover:text-slate-300 transition-colors">
              Link to current position
              {linkToTimestamp && (
                <span className="ml-1 text-blue-400 font-mono">
                  ({formatTimestamp(currentTime)})
                </span>
              )}
            </span>
          </label>
          <button
            type="submit"
            disabled={!newComment.trim() || isSubmitting}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Saving...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add
              </>
            )}
          </button>
        </div>
      </form>

      {/* Comments List */}
      <div className="max-h-[400px] overflow-y-auto">
        {loading ? (
          <div className="p-8 text-center">
            <svg className="animate-spin w-6 h-6 text-blue-400 mx-auto" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : comments.length === 0 ? (
          <div className="p-8 text-center">
            <svg className="w-12 h-12 text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            <p className="text-slate-500 text-sm">No comments yet</p>
            <p className="text-slate-600 text-xs mt-1">Add notes to remember important points</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/30">
            {comments.map((comment) => (
              <div key={comment.id} className="p-4 hover:bg-slate-700/20 transition-colors group">
                {editingId === comment.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editingContent}
                      onChange={(e) => setEditingContent(e.target.value)}
                      rows={3}
                      autoFocus
                      className="w-full px-3 py-2 bg-slate-900/50 border border-blue-500/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none text-sm"
                    />
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1 text-slate-400 hover:text-white text-sm transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleUpdate(comment.id)}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Timestamp badge */}
                        {comment.timestamp_seconds !== null && (
                          <button
                            onClick={() => onSeek?.(comment.timestamp_seconds!)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs font-mono rounded mb-2 hover:bg-blue-500/30 transition-colors"
                          >
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                            {formatTimestamp(comment.timestamp_seconds)}
                          </button>
                        )}
                        
                        {/* Content */}
                        <p className="text-slate-300 text-sm whitespace-pre-wrap break-words">
                          {comment.content}
                        </p>
                        
                        {/* Date */}
                        <p className="text-slate-500 text-xs mt-2">
                          {formatDate(comment.created_at)}
                        </p>
                      </div>
                      
                      {/* Actions */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => startEdit(comment)}
                          className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-slate-700/50 rounded transition-colors"
                          title="Edit"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => openDeleteModal(comment)}
                          className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-700/50 rounded transition-colors"
                          title="Delete"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={closeDeleteModal}
        onConfirm={handleDelete}
        title="Delete Comment"
        message="Are you sure you want to delete this comment? This action cannot be undone."
        confirmText="Delete"
        variant="danger"
        loading={isDeleting}
      />
    </div>
  )
}

