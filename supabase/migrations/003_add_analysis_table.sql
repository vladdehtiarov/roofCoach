-- Migration: Add audio_analyses table for structured AI analysis
-- Run this in Supabase SQL Editor

-- First, create the update_updated_at_column function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create is_admin function if it doesn't exist (SECURITY DEFINER to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the audio_analyses table
CREATE TABLE IF NOT EXISTS public.audio_analyses (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    recording_id uuid NOT NULL REFERENCES public.recordings(id) ON DELETE CASCADE,
    
    -- Full transcript
    transcript text NOT NULL,
    
    -- Headlines/Summary
    title text NOT NULL,
    summary text NOT NULL,
    
    -- Timeline with topics (JSONB array)
    timeline jsonb DEFAULT '[]'::jsonb,
    
    -- Main topics (JSONB array of strings)
    main_topics jsonb DEFAULT '[]'::jsonb,
    
    -- Glossary of terms (JSONB array)
    glossary jsonb DEFAULT '[]'::jsonb,
    
    -- AI Insights (JSONB array)
    insights jsonb DEFAULT '[]'::jsonb,
    
    -- Conclusion
    conclusion text NOT NULL,
    
    -- Metadata
    duration_analyzed numeric,
    language text DEFAULT 'en',
    confidence_score numeric DEFAULT 0.8,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    -- Ensure one analysis per recording
    UNIQUE(recording_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_audio_analyses_recording_id ON public.audio_analyses(recording_id);

-- Enable RLS
ALTER TABLE public.audio_analyses ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can see analyses for their own recordings
CREATE POLICY "Users can view own analyses" ON public.audio_analyses
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.recordings r
            WHERE r.id = recording_id
            AND r.user_id = auth.uid()
        )
    );

-- Users can insert analyses for their own recordings
CREATE POLICY "Users can insert own analyses" ON public.audio_analyses
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.recordings r
            WHERE r.id = recording_id
            AND r.user_id = auth.uid()
        )
    );

-- Users can update analyses for their own recordings
CREATE POLICY "Users can update own analyses" ON public.audio_analyses
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.recordings r
            WHERE r.id = recording_id
            AND r.user_id = auth.uid()
        )
    );

-- Users can delete analyses for their own recordings
CREATE POLICY "Users can delete own analyses" ON public.audio_analyses
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.recordings r
            WHERE r.id = recording_id
            AND r.user_id = auth.uid()
        )
    );

-- Admins can see all analyses
CREATE POLICY "Admins can view all analyses" ON public.audio_analyses
    FOR SELECT
    USING (public.is_admin());

-- Add updated_at trigger
CREATE TRIGGER update_audio_analyses_updated_at
    BEFORE UPDATE ON public.audio_analyses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Update the recordings_with_status view to include analysis info
DROP VIEW IF EXISTS public.recordings_with_status;

CREATE VIEW public.recordings_with_status AS
SELECT 
    r.*,
    t.id IS NOT NULL as has_transcript,
    t.text as transcript_text,
    a.id IS NOT NULL as has_analysis,
    a.title as analysis_title,
    p.email as user_email,
    p.role as user_role
FROM public.recordings r
LEFT JOIN public.transcripts t ON r.id = t.recording_id
LEFT JOIN public.audio_analyses a ON r.id = a.recording_id
LEFT JOIN public.profiles p ON r.user_id = p.id;

-- Grant permissions
GRANT ALL ON public.audio_analyses TO authenticated;
GRANT SELECT ON public.recordings_with_status TO authenticated;

