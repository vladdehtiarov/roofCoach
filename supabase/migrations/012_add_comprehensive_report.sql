-- Migration: Add comprehensive_report column to audio_analyses
-- This stores the detailed sales coaching report in WHY/WHAT/WHO/WHEN format

ALTER TABLE audio_analyses 
ADD COLUMN IF NOT EXISTS comprehensive_report JSONB DEFAULT NULL;

-- Add comment
COMMENT ON COLUMN audio_analyses.comprehensive_report IS 'Detailed sales coaching report with WHY/WHAT/WHO/WHEN phases, checkpoints, and coaching recommendations';

