-- Migration: Replace old analysis columns with W4 Report structure
-- This migration adds the w4_report JSONB column and removes legacy columns

-- First, drop the dependent view
DROP VIEW IF EXISTS recordings_with_status;

-- Add new W4 report column
ALTER TABLE audio_analyses 
ADD COLUMN IF NOT EXISTS w4_report JSONB DEFAULT NULL;

-- Remove NOT NULL constraints from legacy columns (make them nullable)
ALTER TABLE audio_analyses ALTER COLUMN timeline DROP NOT NULL;
ALTER TABLE audio_analyses ALTER COLUMN glossary DROP NOT NULL;
ALTER TABLE audio_analyses ALTER COLUMN insights DROP NOT NULL;
ALTER TABLE audio_analyses ALTER COLUMN conclusion DROP NOT NULL;
ALTER TABLE audio_analyses ALTER COLUMN main_topics DROP NOT NULL;

-- Set default values for legacy columns
ALTER TABLE audio_analyses ALTER COLUMN timeline SET DEFAULT '[]'::jsonb;
ALTER TABLE audio_analyses ALTER COLUMN glossary SET DEFAULT '[]'::jsonb;
ALTER TABLE audio_analyses ALTER COLUMN insights SET DEFAULT '[]'::jsonb;
ALTER TABLE audio_analyses ALTER COLUMN conclusion SET DEFAULT '';
ALTER TABLE audio_analyses ALTER COLUMN main_topics SET DEFAULT '{}';

-- Drop old sales coaching columns (no longer used)
ALTER TABLE audio_analyses DROP COLUMN IF EXISTS scorecard;
ALTER TABLE audio_analyses DROP COLUMN IF EXISTS customer_analysis;
ALTER TABLE audio_analyses DROP COLUMN IF EXISTS speaker_analytics;
ALTER TABLE audio_analyses DROP COLUMN IF EXISTS re_engage;
ALTER TABLE audio_analyses DROP COLUMN IF EXISTS coaching;
ALTER TABLE audio_analyses DROP COLUMN IF EXISTS comprehensive_report;

-- Recreate the view without the old columns
CREATE OR REPLACE VIEW recordings_with_status AS
SELECT 
  r.*,
  CASE WHEN t.id IS NOT NULL THEN true ELSE false END as has_transcript,
  t.text as transcript_text,
  CASE WHEN a.id IS NOT NULL THEN true ELSE false END as has_analysis,
  a.title as analysis_title,
  a.w4_report as w4_report,
  p.email as user_email,
  p.role as user_role
FROM recordings r
LEFT JOIN transcripts t ON t.recording_id = r.id
LEFT JOIN audio_analyses a ON a.recording_id = r.id
LEFT JOIN profiles p ON p.id = r.user_id;

-- Create index for searching by score
CREATE INDEX IF NOT EXISTS idx_audio_analyses_w4_score 
ON audio_analyses (CAST(w4_report->'overall_performance'->>'total_score' AS INTEGER))
WHERE w4_report IS NOT NULL;

-- Create index for searching by rating
CREATE INDEX IF NOT EXISTS idx_audio_analyses_w4_rating 
ON audio_analyses ((w4_report->'overall_performance'->>'rating'))
WHERE w4_report IS NOT NULL;

COMMENT ON COLUMN audio_analyses.w4_report IS 'W4 Sales System analysis report containing phases (WHY, WHAT, WHO, WHEN), checkpoints, coaching recommendations, and quick wins';
