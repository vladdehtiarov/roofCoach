'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Tag, TagInsert } from '@/types/database'
import { useToast } from '@/components/ui/Toast'

interface TagManagerProps {
  userId: string
  recordingId?: string
  selectedTags?: string[] // Tag IDs
  onTagsChange?: (tagIds: string[]) => void
  mode?: 'manage' | 'select' // manage = create/edit tags, select = just pick tags
  compact?: boolean
}

const TAG_COLORS = [
  '#10b981', // emerald
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#f59e0b', // amber
  '#ef4444', // red
  '#ec4899', // pink
  '#14b8a6', // teal
  '#6366f1', // indigo
]

export default function TagManager({
  userId,
  recordingId,
  selectedTags = [],
  onTagsChange,
  mode = 'select',
  compact = false,
}: TagManagerProps) {
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0])
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const toast = useToast()
  const supabase = createClient()

  useEffect(() => {
    loadTags()
  }, [userId])

  useEffect(() => {
    // Close dropdown when clicking outside
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const loadTags = async () => {
    try {
      const { data, error } = await supabase
        .from('tags')
        .select('*')
        .eq('user_id', userId)
        .order('name')

      if (error) throw error
      setTags(data || [])
    } catch (err) {
      console.error('Error loading tags:', err)
    } finally {
      setLoading(false)
    }
  }

  const createTag = async () => {
    if (!newTagName.trim()) return

    setIsCreating(true)
    try {
      const tagInsert: TagInsert = {
        user_id: userId,
        name: newTagName.trim(),
        color: newTagColor,
      }

      const { data, error } = await supabase
        .from('tags')
        .insert(tagInsert)
        .select()
        .single()

      if (error) {
        if (error.code === '23505') {
          toast.error('Tag already exists')
        } else {
          throw error
        }
        return
      }

      setTags([...tags, data])
      setNewTagName('')
      setNewTagColor(TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)])
      toast.success(`Tag "${data.name}" created`)
      
      // Auto-select new tag
      if (onTagsChange) {
        onTagsChange([...selectedTags, data.id])
      }
    } catch (err) {
      console.error('Error creating tag:', err)
      toast.error('Failed to create tag')
    } finally {
      setIsCreating(false)
    }
  }

  const deleteTag = async (tagId: string) => {
    try {
      const { error } = await supabase
        .from('tags')
        .delete()
        .eq('id', tagId)

      if (error) throw error

      setTags(tags.filter(t => t.id !== tagId))
      if (selectedTags.includes(tagId) && onTagsChange) {
        onTagsChange(selectedTags.filter(id => id !== tagId))
      }
      toast.success('Tag deleted')
    } catch (err) {
      console.error('Error deleting tag:', err)
      toast.error('Failed to delete tag')
    }
  }

  const toggleTag = (tagId: string) => {
    if (!onTagsChange) return
    
    if (selectedTags.includes(tagId)) {
      onTagsChange(selectedTags.filter(id => id !== tagId))
    } else {
      onTagsChange([...selectedTags, tagId])
    }
  }

  const selectedTagObjects = tags.filter(t => selectedTags.includes(t.id))

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-6 w-16 bg-slate-700 rounded animate-pulse" />
        <div className="h-6 w-20 bg-slate-700 rounded animate-pulse" />
      </div>
    )
  }

  // Compact mode - just show selected tags
  if (compact && !isOpen) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {selectedTagObjects.map(tag => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
            style={{ backgroundColor: `${tag.color}20`, color: tag.color, border: `1px solid ${tag.color}40` }}
          >
            {tag.name}
          </span>
        ))}
        <button
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-700/50 text-slate-400 hover:bg-slate-600 hover:text-slate-300 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          {selectedTagObjects.length === 0 ? 'Add tags' : ''}
        </button>
      </div>
    )
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Selected tags display */}
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        {selectedTagObjects.map(tag => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer group"
            style={{ backgroundColor: `${tag.color}20`, color: tag.color, border: `1px solid ${tag.color}40` }}
            onClick={() => toggleTag(tag.id)}
          >
            {tag.name}
            <svg className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </span>
        ))}
      </div>

      {/* Tag picker */}
      <div className="bg-slate-800/80 backdrop-blur-sm rounded-lg border border-slate-700/50 p-3">
        {/* Available tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {tags.map(tag => {
              const isSelected = selectedTags.includes(tag.id)
              return (
                <button
                  key={tag.id}
                  onClick={() => toggleTag(tag.id)}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-all ${
                    isSelected 
                      ? 'ring-2 ring-offset-1 ring-offset-slate-800'
                      : 'opacity-60 hover:opacity-100'
                  }`}
                  style={{ 
                    backgroundColor: `${tag.color}20`, 
                    color: tag.color, 
                    border: `1px solid ${tag.color}40`,
                    ...(isSelected ? { ringColor: tag.color } : {})
                  }}
                >
                  {isSelected && (
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                  {tag.name}
                  {mode === 'manage' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteTag(tag.id)
                      }}
                      className="ml-1 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* Create new tag */}
        <div className="flex items-center gap-2">
          {/* Color picker */}
          <div className="relative">
            <button
              onClick={() => setShowColorPicker(!showColorPicker)}
              className="w-6 h-6 rounded-full border-2 border-slate-600 hover:border-slate-500 transition-colors"
              style={{ backgroundColor: newTagColor }}
            />
            {showColorPicker && (
              <div className="absolute top-8 left-0 z-10 bg-slate-800 rounded-lg border border-slate-700 p-2 shadow-xl">
                <div className="grid grid-cols-4 gap-1">
                  {TAG_COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => {
                        setNewTagColor(color)
                        setShowColorPicker(false)
                      }}
                      className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${
                        newTagColor === color ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-800' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <input
            ref={inputRef}
            type="text"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newTagName.trim()) {
                createTag()
              }
            }}
            placeholder="New tag name..."
            className="flex-1 bg-slate-700/50 border border-slate-600 rounded px-2 py-1 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-slate-500"
          />

          <button
            onClick={createTag}
            disabled={!newTagName.trim() || isCreating}
            className="px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded text-sm font-medium hover:bg-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isCreating ? '...' : 'Add'}
          </button>
        </div>

        {/* Close button for compact mode */}
        {compact && (
          <button
            onClick={() => setIsOpen(false)}
            className="mt-2 w-full py-1 text-xs text-slate-400 hover:text-white transition-colors"
          >
            Done
          </button>
        )}
      </div>
    </div>
  )
}

// Simple inline tag display (read-only)
export function TagDisplay({ tags }: { tags: Tag[] }) {
  if (tags.length === 0) return null
  
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map(tag => (
        <span
          key={tag.id}
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium"
          style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
        >
          {tag.name}
        </span>
      ))}
    </div>
  )
}

