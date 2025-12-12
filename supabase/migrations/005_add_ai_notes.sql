-- Migration: Add ai_notes column for markdown-formatted AI analysis article

ALTER TABLE public.audio_analyses 
ADD COLUMN IF NOT EXISTS ai_notes text;

COMMENT ON COLUMN public.audio_analyses.ai_notes IS 'Markdown-formatted AI-generated article with comprehensive analysis';

