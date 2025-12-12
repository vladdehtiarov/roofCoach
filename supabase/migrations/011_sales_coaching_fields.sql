-- Migration: Add sales coaching fields to audio_analyses
-- This adds the new structure for Siro-like sales coaching analysis

-- Add new JSONB columns for structured sales analysis data
ALTER TABLE audio_analyses 
ADD COLUMN IF NOT EXISTS scorecard JSONB DEFAULT NULL;

ALTER TABLE audio_analyses 
ADD COLUMN IF NOT EXISTS customer_analysis JSONB DEFAULT NULL;

ALTER TABLE audio_analyses 
ADD COLUMN IF NOT EXISTS speaker_analytics JSONB DEFAULT NULL;

ALTER TABLE audio_analyses 
ADD COLUMN IF NOT EXISTS re_engage JSONB DEFAULT NULL;

-- Add index for faster queries on scorecard total score (using CAST)
CREATE INDEX IF NOT EXISTS idx_audio_analyses_scorecard_total 
ON audio_analyses (CAST(scorecard->>'total' AS INTEGER)) 
WHERE scorecard IS NOT NULL;

-- Add index for call outcome filtering
CREATE INDEX IF NOT EXISTS idx_audio_analyses_call_outcome 
ON audio_analyses ((customer_analysis->'summary'->>'call_outcome')) 
WHERE customer_analysis IS NOT NULL;

-- Comment on new columns
COMMENT ON COLUMN audio_analyses.scorecard IS 'Sales process scorecard with total, process, skills, and communication scores';
COMMENT ON COLUMN audio_analyses.customer_analysis IS 'Customer needs, pain points, objections, and outcomes with timestamps';
COMMENT ON COLUMN audio_analyses.speaker_analytics IS 'Speaker metrics: talk time, pacing, questions, monologues';
COMMENT ON COLUMN audio_analyses.re_engage IS 'Re-engagement data: recap, pricing, objections, next steps, suggested message';

-- Update the recordings_with_status view to include new fields
DROP VIEW IF EXISTS recordings_with_status;

CREATE VIEW recordings_with_status AS
SELECT 
  r.id,
  r.user_id,
  r.file_name,
  r.file_path,
  r.file_size,
  r.duration,
  r.status,
  r.is_archived,
  r.created_at,
  r.updated_at,
  r.analysis_file_path,
  r.analysis_file_size,
  r.folder_id,
  -- Transcript info
  t.id IS NOT NULL as has_transcript,
  LEFT(t.text, 500) as transcript_text,
  -- Analysis info
  a.id IS NOT NULL as has_analysis,
  a.title as analysis_title,
  a.processing_status as analysis_status,
  -- New: scorecard total for sorting/filtering
  CAST(a.scorecard->>'total' AS INTEGER) as scorecard_total
FROM recordings r
LEFT JOIN transcripts t ON t.recording_id = r.id
LEFT JOIN audio_analyses a ON a.recording_id = r.id;

-- Grant access to the view
GRANT SELECT ON recordings_with_status TO authenticated;

