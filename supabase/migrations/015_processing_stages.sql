-- Migration: Add processing stages for 2-step analysis flow
-- Stage 1: Transcription, Stage 2: W4 Analysis

-- Add processing_stage column to track which step we're on
ALTER TABLE audio_analyses 
ADD COLUMN IF NOT EXISTS processing_stage TEXT DEFAULT 'pending';

-- Valid stages: 'pending' | 'transcribing' | 'analyzing' | 'done' | 'error'

-- Add transcription-specific fields
ALTER TABLE audio_analyses 
ADD COLUMN IF NOT EXISTS transcription_completed_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE audio_analyses 
ADD COLUMN IF NOT EXISTS analysis_completed_at TIMESTAMPTZ DEFAULT NULL;

-- Index for finding records by stage
CREATE INDEX IF NOT EXISTS idx_audio_analyses_stage 
ON audio_analyses (processing_stage);

COMMENT ON COLUMN audio_analyses.processing_stage IS 'Current processing stage: pending, transcribing, analyzing, done, error';
COMMENT ON COLUMN audio_analyses.transcription_completed_at IS 'When transcription step completed';
COMMENT ON COLUMN audio_analyses.analysis_completed_at IS 'When W4 analysis step completed';

