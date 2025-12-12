// Database types for Supabase tables

export type UserRole = 'user' | 'admin'

export type RecordingStatus = 'uploading' | 'processing' | 'done' | 'error'

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

export interface AudioAnalysis {
  id: string
  recording_id: string
  
  // Full transcript (combined from all sections)
  transcript: string
  
  // Chunked sections with progress
  sections: TranscriptSection[]
  processing_status: AnalysisStatus
  total_chunks: number
  completed_chunks: number
  current_chunk_message: string | null
  error_message: string | null
  
  // Headlines/Summary
  title: string                    // AI-generated title for the recording
  summary: string                  // Brief overview
  
  // AI Notes - markdown formatted article
  ai_notes: string | null          // Beautiful markdown article with analysis
  
  // Timeline with topics
  timeline: TimelineSegment[]
  
  // Key topics discussed
  main_topics: string[]
  
  // Glossary of terms
  glossary: GlossaryTerm[]
  
  // AI Insights & Recommendations
  insights: AnalysisInsight[]
  
  // Conclusion
  conclusion: string
  
  // Metadata
  duration_analyzed: number | null // seconds
  language: string                 // "en", "uk"
  confidence_score: number         // 0-1
  
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

