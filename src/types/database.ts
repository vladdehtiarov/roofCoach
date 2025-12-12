// Database types for Supabase tables

export type UserRole = 'user' | 'admin'

export type RecordingStatus = 'uploading' | 'processing' | 'done' | 'error'

// Folder for organizing recordings
export interface Folder {
  id: string
  user_id: string
  name: string
  color: string
  icon: string
  parent_id: string | null
  created_at: string
  updated_at: string
}

// Tag for labeling recordings
export interface Tag {
  id: string
  user_id: string
  name: string
  color: string
  created_at: string
}

// Many-to-many: recording <-> tag
export interface RecordingTag {
  id: string
  recording_id: string
  tag_id: string
  created_at: string
}

// Bookmark for marking important moments
export interface Bookmark {
  id: string
  recording_id: string
  user_id: string
  timestamp_seconds: number
  title: string
  note: string | null
  color: string
  created_at: string
  updated_at: string
}

// Comment on a recording
export interface Comment {
  id: string
  recording_id: string
  user_id: string
  parent_id: string | null
  content: string
  timestamp_seconds: number | null
  created_at: string
  updated_at: string
}

// Shared recording link
export interface SharedRecording {
  id: string
  recording_id: string
  shared_by: string
  shared_with: string | null
  share_token: string | null
  permissions: 'view' | 'comment' | 'edit'
  expires_at: string | null
  created_at: string
}

export interface Profile {
  id: string
  email: string
  role: UserRole
  created_at: string
  updated_at: string
}

export interface Recording {
  id: string
  user_id: string
  file_path: string
  analysis_file_path: string | null // Compressed version for AI analysis
  analysis_file_size: number | null // Size of compressed file in bytes
  file_name: string
  file_size: number
  duration: number | null
  status: RecordingStatus
  is_archived: boolean
  folder_id: string | null // Reference to folder
  created_at: string
  updated_at: string
}

export interface Transcript {
  id: string
  recording_id: string
  text: string
  created_at: string
  updated_at: string
}

// Structured Analysis Types
export interface TimelineSegment {
  start_time: string      // "0:00"
  end_time: string        // "2:30"
  title: string           // "Greeting & Introduction"
  summary: string         // Brief description
  topics: string[]        // ["sales", "introduction"]
}

export interface GlossaryTerm {
  term: string            // "Shingle"
  definition: string      // "A flat rectangular piece..."
  context?: string        // How it was used in the conversation
}

export interface AnalysisInsight {
  type: 'strength' | 'improvement' | 'tip'
  title: string
  description: string
}

// Section from chunked transcription
export interface TranscriptSection {
  chunk_index: number
  timestamp_start: string          // "0:00"
  timestamp_end: string            // "45:00"
  title: string
  content: string                  // Full transcript text for this chunk
  summary: string                  // Brief summary
  topics?: string[]
}

export type AnalysisStatus = 'pending' | 'processing' | 'done' | 'error'

// ============================================================================
// SALES COACHING TYPES (Siro-like structure)
// ============================================================================

export interface ScorecardItem {
  name: string
  score: number
  timestamp?: string
  notes?: string
}

export interface ScorecardCategory {
  score: number
  weight: number
  items: ScorecardItem[]
}

export interface Scorecard {
  total: number
  process: ScorecardCategory
  skills: ScorecardCategory
  communication: ScorecardCategory
}

export interface InsightWithTimestamps {
  text: string
  timestamps: string[]
  type?: 'price' | 'timing' | 'trust' | 'other'
}

export interface CustomerAnalysis {
  needs_motivation: InsightWithTimestamps[]
  pain_points: InsightWithTimestamps[]
  objections: InsightWithTimestamps[]
  outcomes_next_steps: InsightWithTimestamps[]
}

export interface SpeakerAnalytics {
  conversation_time: string
  rep_speaking_time: string
  customer_speaking_time: string
  speaker_share_rep: number
  pacing_wpm: number
  questions_asked: number
  questions_received: number
  longest_monologue: string
  exchanges: number
}

export interface ReEngage {
  recap: string
  first_price_quote: string
  final_price_quote: string
  financing: string
  commitment: string
  main_objection: string
  emotional_tie: string
  recommended_action: string
  suggested_message: string
}

export interface TranscriptEntry {
  speaker: 'Rep' | 'Customer' | string
  text: string
  timestamp: string
}

// ============================================================================
// AUDIO ANALYSIS (Main interface)
// ============================================================================

export interface AudioAnalysis {
  id: string
  recording_id: string
  
  // Full transcript (JSON string of TranscriptEntry[])
  transcript: string
  
  // Chunked sections with progress (legacy)
  sections: TranscriptSection[]
  processing_status: AnalysisStatus
  total_chunks: number
  completed_chunks: number
  current_chunk_message: string | null
  error_message: string | null
  
  // Headlines/Summary
  title: string
  summary: string
  
  // AI Notes - markdown formatted article (legacy)
  ai_notes: string | null
  
  // Timeline with topics (legacy)
  timeline: TimelineSegment[]
  
  // Key topics discussed
  main_topics: string[]
  
  // Glossary of terms (legacy)
  glossary: GlossaryTerm[]
  
  // AI Insights & Recommendations (legacy)
  insights: AnalysisInsight[]
  
  // Conclusion (legacy)
  conclusion: string
  
  // ============================================
  // NEW: Sales Coaching Fields (Siro-like)
  // ============================================
  scorecard: Scorecard | null
  customer_analysis: CustomerAnalysis | null
  speaker_analytics: SpeakerAnalytics | null
  re_engage: ReEngage | null
  
  // Metadata
  duration_analyzed: number | null
  language: string
  confidence_score: number
  
  // Token usage tracking
  input_tokens: number
  output_tokens: number
  total_tokens: number
  model_used: string
  estimated_cost_usd: number
  
  created_at: string
  updated_at: string
}

// Token usage log for detailed tracking
export interface TokenUsageLog {
  id: string
  user_id: string
  analysis_id: string
  recording_id: string
  request_type: 'transcription_chunk' | 'final_analysis' | 'ai_notes'
  chunk_index: number | null
  input_tokens: number
  output_tokens: number
  total_tokens: number
  model_used: string
  created_at: string
}

// Admin stats types
export interface UserTokenStats {
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

export interface PlatformTokenStats {
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

// Extended types for joins
export interface RecordingWithTranscript extends Recording {
  has_transcript: boolean
  transcript_text: string | null
  has_analysis: boolean
  analysis_title: string | null
  user_email?: string
  user_role?: string
}

export interface RecordingWithProfile extends Recording {
  profile: Profile
}

// Insert types (without auto-generated fields)
export interface ProfileInsert {
  id: string
  email: string
  role?: UserRole
}

export interface RecordingInsert {
  user_id: string
  file_path: string
  analysis_file_path?: string | null
  file_name: string
  file_size: number
  duration?: number | null
  status?: RecordingStatus
  is_archived?: boolean
  folder_id?: string | null
}

// Insert types for new tables
export interface FolderInsert {
  user_id: string
  name: string
  color?: string
  icon?: string
  parent_id?: string | null
}

export interface TagInsert {
  user_id: string
  name: string
  color?: string
}

export interface BookmarkInsert {
  recording_id: string
  user_id: string
  timestamp_seconds: number
  title: string
  note?: string | null
  color?: string
}

export interface CommentInsert {
  recording_id: string
  user_id: string
  parent_id?: string | null
  content: string
  timestamp_seconds?: number | null
}

export interface SharedRecordingInsert {
  recording_id: string
  shared_by: string
  shared_with?: string | null
  share_token?: string | null
  permissions?: 'view' | 'comment' | 'edit'
  expires_at?: string | null
}

export interface TranscriptInsert {
  recording_id: string
  text: string
}

// Update types (all fields optional except id)
export interface RecordingUpdate {
  file_path?: string
  file_name?: string
  file_size?: number
  duration?: number | null
  status?: RecordingStatus
}

export interface TranscriptUpdate {
  text?: string
}

// Supabase Database type for type-safe queries
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: ProfileInsert
        Update: Partial<Omit<Profile, 'id' | 'created_at'>>
      }
      recordings: {
        Row: Recording
        Insert: RecordingInsert
        Update: RecordingUpdate
      }
      transcripts: {
        Row: Transcript
        Insert: TranscriptInsert
        Update: TranscriptUpdate
      }
    }
    Views: {
      recordings_with_status: {
        Row: RecordingWithTranscript
      }
    }
  }
}

