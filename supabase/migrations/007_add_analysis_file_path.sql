-- Add analysis_file_path and analysis_file_size columns for compressed audio files used by AI
-- Original file stays for playback, compressed version for analysis

ALTER TABLE recordings ADD COLUMN IF NOT EXISTS analysis_file_path TEXT;
ALTER TABLE recordings ADD COLUMN IF NOT EXISTS analysis_file_size BIGINT;

-- Add comments explaining the columns
COMMENT ON COLUMN recordings.analysis_file_path IS 'Path to compressed audio file optimized for AI analysis (8-24kbps). Original file_path is used for playback.';
COMMENT ON COLUMN recordings.analysis_file_size IS 'Size in bytes of the compressed analysis file.';

