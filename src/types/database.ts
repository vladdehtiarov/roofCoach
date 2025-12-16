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
// W4 SALES SYSTEM TYPES (RepFuel methodology)
// ============================================================================

// Performance ratings
export type W4Rating = 'MVP' | 'Playmaker' | 'Starter' | 'Prospect' | 'Below Prospect'

// Rating thresholds
export const W4_RATING_THRESHOLDS = {
  MVP: { min: 90, max: 100, color: '#22c55e' },           // Green
  Playmaker: { min: 75, max: 89, color: '#3b82f6' },      // Blue
  Starter: { min: 60, max: 74, color: '#eab308' },        // Yellow
  Prospect: { min: 45, max: 59, color: '#f97316' },       // Orange
  'Below Prospect': { min: 0, max: 44, color: '#ef4444' } // Red
} as const

// Checkpoint within a phase
export interface W4Checkpoint {
  name: string
  score: number
  max_score: number
  justification: string
}

// Phase (WHY, WHAT, WHO, WHEN)
export interface W4Phase {
  score: number
  max_score: number
  checkpoints: W4Checkpoint[]
}

// Coaching recommendations structure
export interface W4CoachingRecommendations {
  rapport_building?: string
  structured_communication?: string
  tie_downs?: string
  post_price_silence?: string
  [key: string]: string | undefined  // Allow additional coaching topics
}

// Quick win item
export interface W4QuickWin {
  title: string
  action: string
  points_worth: number
}

// Area for improvement item
export interface W4AreaForImprovement {
  area: string
  recommendation: string
}

// Rank assessment
export interface W4RankAssessment {
  current_rank: W4Rating
  next_level_requirements: string
}

// Overall performance summary
export interface W4OverallPerformance {
  total_score: number
  rating: W4Rating
  summary: string
}

// Complete W4 Report structure
export interface W4Report {
  // Header info
  client_name: string
  rep_name: string
  company_name: string
  
  // Overall performance
  overall_performance: W4OverallPerformance
  
  // Four phases with checkpoints
  phases: {
    why: W4Phase   // 38 max points, 6 checkpoints
    what: W4Phase  // 27 max points, 4 checkpoints
    who: W4Phase   // 25 max points, 3 checkpoints
    when: W4Phase  // 10 max points, 2 checkpoints
  }
  
  // Analysis sections
  what_done_right: string[]
  areas_for_improvement: W4AreaForImprovement[]
  weakest_elements: string[]
  
  // Coaching
  coaching_recommendations: W4CoachingRecommendations
  rank_assessment: W4RankAssessment
  quick_wins: W4QuickWin[]
}

// Helper function to get rating from score
export function getW4Rating(score: number): W4Rating {
  if (score >= 90) return 'MVP'
  if (score >= 75) return 'Playmaker'
  if (score >= 60) return 'Starter'
  if (score >= 45) return 'Prospect'
  return 'Below Prospect'
}

// Helper function to get rating color
export function getW4RatingColor(rating: W4Rating): string {
  return W4_RATING_THRESHOLDS[rating].color
}

// Phase metadata for UI
export const W4_PHASE_CONFIG = {
  why: { name: 'WHY', maxScore: 38, description: 'Building rapport and understanding needs' },
  what: { name: 'WHAT', maxScore: 27, description: 'Presenting solutions and options' },
  who: { name: 'WHO', maxScore: 25, description: 'Establishing company credibility' },
  when: { name: 'WHEN', maxScore: 10, description: 'Closing and next steps' }
} as const

// Checkpoint names for each phase (fixed structure)
export const W4_CHECKPOINTS = {
  why: [
    { name: 'Sitdown/Transition', maxScore: 5 },
    { name: 'Rapport Building – FORM Method', maxScore: 5 },
    { name: 'Assessment Questions (Q1–Q16)', maxScore: 12 },
    { name: 'Inspection', maxScore: 3 },
    { name: 'Present Findings', maxScore: 5 },
    { name: 'Tie-Down WHY & Repair vs. Replace', maxScore: 8 }
  ],
  what: [
    { name: 'Formal Presentation System', maxScore: 5 },
    { name: 'System Options – FBAL Method', maxScore: 12 },
    { name: 'Backup Recommendations/Visuals', maxScore: 5 },
    { name: 'Tie-Down WHAT', maxScore: 5 }
  ],
  who: [
    { name: 'Company Advantages', maxScore: 8 },
    { name: 'Pyramid of Pain', maxScore: 8 },
    { name: 'WHO Tie-Down', maxScore: 9 }
  ],
  when: [
    { name: 'Price Presentation', maxScore: 5 },
    { name: 'Post-Close Silence', maxScore: 5 }
  ]
} as const

// Legacy types kept for backward compatibility (deprecated)
export interface TranscriptEntry {
  speaker: 'Rep' | 'Customer' | string
  text: string
  timestamp: string
}

// ============================================================================
// AUDIO ANALYSIS (Main interface)
// ============================================================================

export type ProcessingStage = 'pending' | 'transcribing' | 'analyzing' | 'done' | 'error'

export interface AudioAnalysis {
  id: string
  recording_id: string
  
  // Full transcript (plain text format)
  transcript: string
  
  // Processing status
  processing_status: AnalysisStatus
  processing_stage: ProcessingStage  // 2-step flow: transcribing -> analyzing
  total_chunks: number
  completed_chunks: number
  current_chunk_message: string | null
  error_message: string | null
  
  // Headlines/Summary (from W4 report)
  title: string
  summary: string
  
  // ============================================
  // W4 Sales System Report
  // ============================================
  w4_report: W4Report | null
  
  // Legacy fields (kept for backward compatibility, will be deprecated)
  sections?: TranscriptSection[]
  ai_notes?: string | null
  timeline?: TimelineSegment[]
  main_topics?: string[]
  glossary?: GlossaryTerm[]
  insights?: AnalysisInsight[]
  conclusion?: string
  scorecard?: unknown
  customer_analysis?: unknown
  speaker_analytics?: unknown
  re_engage?: unknown
  coaching?: unknown
  comprehensive_report?: unknown
  
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

