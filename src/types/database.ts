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

// Extended types for joins
export interface RecordingWithTranscript extends Recording {
  has_transcript: boolean
  transcript_text: string | null
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

