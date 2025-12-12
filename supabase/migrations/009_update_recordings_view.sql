-- Migration: Update recordings_with_status view to include folder_id
-- Created: 2024

-- Drop and recreate the view with folder support
DROP VIEW IF EXISTS public.recordings_with_status;

CREATE OR REPLACE VIEW public.recordings_with_status AS
SELECT 
    r.*,
    CASE WHEN t.id IS NOT NULL THEN true ELSE false END as has_transcript,
    t.text as transcript_text,
    CASE WHEN a.id IS NOT NULL THEN true ELSE false END as has_analysis,
    a.title as analysis_title,
    p.email as user_email,
    p.role as user_role
FROM public.recordings r
LEFT JOIN public.transcripts t ON t.recording_id = r.id
LEFT JOIN public.audio_analyses a ON a.recording_id = r.id
LEFT JOIN public.profiles p ON p.id = r.user_id;

-- Grant access to the view
GRANT SELECT ON public.recordings_with_status TO authenticated;

