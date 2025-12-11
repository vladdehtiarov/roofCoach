-- ============================================
-- Migration: Add archive functionality
-- ============================================

-- Add is_archived column to recordings
ALTER TABLE public.recordings 
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;

-- Add index for faster filtering
CREATE INDEX IF NOT EXISTS idx_recordings_is_archived ON public.recordings(is_archived);

-- Update the view to include archive status
DROP VIEW IF EXISTS public.recordings_with_status;

CREATE OR REPLACE VIEW public.recordings_with_status AS
SELECT 
    r.*,
    CASE WHEN t.id IS NOT NULL THEN true ELSE false END as has_transcript,
    t.text as transcript_text,
    p.email as user_email,
    p.role as user_role
FROM public.recordings r
LEFT JOIN public.transcripts t ON t.recording_id = r.id
LEFT JOIN public.profiles p ON p.id = r.user_id;

-- Grant access to the view
GRANT SELECT ON public.recordings_with_status TO authenticated;

-- ============================================
-- Admin helper function
-- ============================================

-- Function to get all recordings for admin (bypasses RLS)
CREATE OR REPLACE FUNCTION public.admin_get_all_recordings()
RETURNS TABLE (
    id UUID,
    user_id UUID,
    file_path TEXT,
    file_name TEXT,
    file_size BIGINT,
    duration NUMERIC,
    status TEXT,
    is_archived BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    has_transcript BOOLEAN,
    transcript_text TEXT,
    user_email TEXT,
    user_role TEXT
) AS $$
BEGIN
    -- Check if current user is admin
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied: Admin only';
    END IF;
    
    RETURN QUERY
    SELECT 
        r.id,
        r.user_id,
        r.file_path,
        r.file_name,
        r.file_size,
        r.duration,
        r.status,
        r.is_archived,
        r.created_at,
        r.updated_at,
        CASE WHEN t.id IS NOT NULL THEN true ELSE false END as has_transcript,
        t.text as transcript_text,
        p.email as user_email,
        p.role as user_role
    FROM public.recordings r
    LEFT JOIN public.transcripts t ON t.recording_id = r.id
    LEFT JOIN public.profiles p ON p.id = r.user_id
    ORDER BY r.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get all users for admin
CREATE OR REPLACE FUNCTION public.admin_get_all_users()
RETURNS TABLE (
    id UUID,
    email TEXT,
    role TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    recordings_count BIGINT,
    total_storage_used BIGINT
) AS $$
BEGIN
    -- Check if current user is admin
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied: Admin only';
    END IF;
    
    RETURN QUERY
    SELECT 
        p.id,
        p.email,
        p.role,
        p.created_at,
        p.updated_at,
        COUNT(r.id)::BIGINT as recordings_count,
        COALESCE(SUM(r.file_size), 0)::BIGINT as total_storage_used
    FROM public.profiles p
    LEFT JOIN public.recordings r ON r.user_id = p.id AND r.is_archived = false
    GROUP BY p.id, p.email, p.role, p.created_at, p.updated_at
    ORDER BY p.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

