-- Migration: Support chunked analysis with progress tracking

-- Add progress tracking to audio_analyses
ALTER TABLE public.audio_analyses 
ADD COLUMN IF NOT EXISTS processing_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS total_chunks int DEFAULT 0,
ADD COLUMN IF NOT EXISTS completed_chunks int DEFAULT 0,
ADD COLUMN IF NOT EXISTS current_chunk_message text,
ADD COLUMN IF NOT EXISTS sections jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS error_message text;

-- Create index for faster status lookups
CREATE INDEX IF NOT EXISTS idx_audio_analyses_status ON public.audio_analyses(processing_status);

-- Enable realtime for audio_analyses table
-- Run this in Supabase Dashboard SQL Editor:
-- ALTER PUBLICATION supabase_realtime ADD TABLE audio_analyses;

-- Add comment for documentation
COMMENT ON COLUMN public.audio_analyses.processing_status IS 'pending | processing | done | error';
COMMENT ON COLUMN public.audio_analyses.sections IS 'JSONB array of transcript sections with chunk_index, timestamp, title, content, summary';
COMMENT ON COLUMN public.audio_analyses.total_chunks IS 'Total number of chunks to process (based on audio duration)';
COMMENT ON COLUMN public.audio_analyses.completed_chunks IS 'Number of chunks successfully processed';

-- Update recordings table to ensure duration field exists
ALTER TABLE public.recordings 
ADD COLUMN IF NOT EXISTS duration_seconds numeric;

-- Grant permissions
GRANT ALL ON public.audio_analyses TO authenticated;

