-- ============================================
-- REPFUEL Database Schema
-- ============================================

-- Enable UUID extension (should be enabled by default in Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. PROFILES TABLE
-- ============================================
-- Stores user profiles linked to auth.users

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster role lookups
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
-- Users can view their own profile
CREATE POLICY "Users can view own profile"
    ON public.profiles
    FOR SELECT
    USING (auth.uid() = id);

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
    ON public.profiles
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Users can update their own profile (except role)
CREATE POLICY "Users can update own profile"
    ON public.profiles
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- ============================================
-- 2. RECORDINGS TABLE
-- ============================================
-- Stores audio recording metadata

CREATE TABLE IF NOT EXISTS public.recordings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size BIGINT NOT NULL DEFAULT 0,
    duration NUMERIC, -- Duration in seconds
    status TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'processing', 'done', 'error')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_recordings_user_id ON public.recordings(user_id);
CREATE INDEX IF NOT EXISTS idx_recordings_status ON public.recordings(status);
CREATE INDEX IF NOT EXISTS idx_recordings_created_at ON public.recordings(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.recordings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for recordings
-- Users can view their own recordings
CREATE POLICY "Users can view own recordings"
    ON public.recordings
    FOR SELECT
    USING (auth.uid() = user_id);

-- Admins can view all recordings
CREATE POLICY "Admins can view all recordings"
    ON public.recordings
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Users can insert their own recordings
CREATE POLICY "Users can insert own recordings"
    ON public.recordings
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own recordings
CREATE POLICY "Users can update own recordings"
    ON public.recordings
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Users can delete their own recordings
CREATE POLICY "Users can delete own recordings"
    ON public.recordings
    FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- 3. TRANSCRIPTS TABLE
-- ============================================
-- Stores transcription text from Gemini API

CREATE TABLE IF NOT EXISTS public.transcripts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recording_id UUID NOT NULL REFERENCES public.recordings(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_transcripts_recording_id ON public.transcripts(recording_id);

-- Enable Row Level Security
ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for transcripts
-- Users can view transcripts for their own recordings
CREATE POLICY "Users can view own transcripts"
    ON public.transcripts
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.recordings
            WHERE recordings.id = transcripts.recording_id
            AND recordings.user_id = auth.uid()
        )
    );

-- Admins can view all transcripts
CREATE POLICY "Admins can view all transcripts"
    ON public.transcripts
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Service role can insert/update transcripts (for Edge Functions)
-- Note: Service role bypasses RLS, so these policies are for authenticated users
CREATE POLICY "Users can insert transcripts for own recordings"
    ON public.transcripts
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.recordings
            WHERE recordings.id = transcripts.recording_id
            AND recordings.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update own transcripts"
    ON public.transcripts
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.recordings
            WHERE recordings.id = transcripts.recording_id
            AND recordings.user_id = auth.uid()
        )
    );

-- ============================================
-- 4. FUNCTIONS & TRIGGERS
-- ============================================

-- Function to automatically create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, role)
    VALUES (NEW.id, NEW.email, 'user');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call handle_new_user on auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_recordings_updated_at
    BEFORE UPDATE ON public.recordings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_transcripts_updated_at
    BEFORE UPDATE ON public.transcripts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 5. STORAGE BUCKET SETUP
-- ============================================
-- Run these in Supabase Dashboard -> Storage -> Policies

-- Create bucket (do this in dashboard or via API)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('audio-files', 'audio-files', false);

-- Storage RLS Policies (run in SQL Editor):

-- Allow users to upload files to their own folder
-- CREATE POLICY "Users can upload to own folder"
-- ON storage.objects
-- FOR INSERT
-- WITH CHECK (
--     bucket_id = 'audio-files' 
--     AND auth.uid()::text = (storage.foldername(name))[1]
-- );

-- Allow users to read their own files
-- CREATE POLICY "Users can read own files"
-- ON storage.objects
-- FOR SELECT
-- USING (
--     bucket_id = 'audio-files' 
--     AND auth.uid()::text = (storage.foldername(name))[1]
-- );

-- Allow users to delete their own files
-- CREATE POLICY "Users can delete own files"
-- ON storage.objects
-- FOR DELETE
-- USING (
--     bucket_id = 'audio-files' 
--     AND auth.uid()::text = (storage.foldername(name))[1]
-- );

-- ============================================
-- 6. HELPER VIEWS (Optional)
-- ============================================

-- View for recordings with transcript status
CREATE OR REPLACE VIEW public.recordings_with_status AS
SELECT 
    r.*,
    CASE WHEN t.id IS NOT NULL THEN true ELSE false END as has_transcript,
    t.text as transcript_text
FROM public.recordings r
LEFT JOIN public.transcripts t ON t.recording_id = r.id;

-- Grant access to the view
GRANT SELECT ON public.recordings_with_status TO authenticated;

