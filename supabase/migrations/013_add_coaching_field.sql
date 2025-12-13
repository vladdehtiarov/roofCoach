-- Migration: Add coaching field to audio_analyses

ALTER TABLE audio_analyses 
ADD COLUMN IF NOT EXISTS coaching JSONB DEFAULT NULL;

COMMENT ON COLUMN audio_analyses.coaching IS 'Coaching insights: strengths, improvements, quick wins';

