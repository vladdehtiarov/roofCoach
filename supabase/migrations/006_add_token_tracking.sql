-- Migration: Add token usage tracking to audio_analyses

-- Add token tracking columns to audio_analyses
ALTER TABLE public.audio_analyses
ADD COLUMN IF NOT EXISTS input_tokens integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS output_tokens integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_tokens integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS model_used text DEFAULT 'gemini-2.0-flash-exp',
ADD COLUMN IF NOT EXISTS estimated_cost_usd numeric(10, 6) DEFAULT 0;

-- Create a separate table for detailed token usage per request (optional, for analytics)
CREATE TABLE IF NOT EXISTS public.token_usage_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    analysis_id uuid REFERENCES public.audio_analyses(id) ON DELETE CASCADE,
    recording_id uuid REFERENCES public.recordings(id) ON DELETE CASCADE,
    request_type text NOT NULL, -- 'transcription_chunk', 'final_analysis', 'ai_notes'
    chunk_index integer,
    input_tokens integer DEFAULT 0,
    output_tokens integer DEFAULT 0,
    total_tokens integer DEFAULT 0,
    model_used text NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_token_usage_logs_user_id ON public.token_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_logs_analysis_id ON public.token_usage_logs(analysis_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_logs_created_at ON public.token_usage_logs(created_at);

-- Enable RLS
ALTER TABLE public.token_usage_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for token_usage_logs
CREATE POLICY "Users can view own token logs" ON public.token_usage_logs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all token logs" ON public.token_usage_logs
    FOR SELECT USING (public.is_admin());

CREATE POLICY "Service can insert token logs" ON public.token_usage_logs
    FOR INSERT WITH CHECK (true);

-- Grant permissions
GRANT ALL ON public.token_usage_logs TO authenticated;

-- Create function for admin to get user token stats
CREATE OR REPLACE FUNCTION public.admin_get_token_stats()
RETURNS TABLE (
    user_id uuid,
    user_email text,
    total_analyses bigint,
    total_input_tokens bigint,
    total_output_tokens bigint,
    total_tokens bigint,
    estimated_cost_usd numeric,
    models_used text[],
    last_analysis_at timestamptz
) AS $$
BEGIN
    -- Check if admin
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied: Admin only';
    END IF;
    
    RETURN QUERY
    SELECT 
        p.id as user_id,
        p.email as user_email,
        COUNT(DISTINCT a.id)::bigint as total_analyses,
        COALESCE(SUM(a.input_tokens), 0)::bigint as total_input_tokens,
        COALESCE(SUM(a.output_tokens), 0)::bigint as total_output_tokens,
        COALESCE(SUM(a.total_tokens), 0)::bigint as total_tokens,
        COALESCE(SUM(a.estimated_cost_usd), 0)::numeric as estimated_cost_usd,
        ARRAY_AGG(DISTINCT a.model_used) FILTER (WHERE a.model_used IS NOT NULL) as models_used,
        MAX(a.created_at) as last_analysis_at
    FROM public.profiles p
    LEFT JOIN public.recordings r ON r.user_id = p.id
    LEFT JOIN public.audio_analyses a ON a.recording_id = r.id
    GROUP BY p.id, p.email
    ORDER BY total_tokens DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get detailed token logs for a user
CREATE OR REPLACE FUNCTION public.admin_get_token_logs(p_user_id uuid DEFAULT NULL, p_limit integer DEFAULT 100)
RETURNS TABLE (
    id uuid,
    user_email text,
    recording_name text,
    request_type text,
    chunk_index integer,
    input_tokens integer,
    output_tokens integer,
    total_tokens integer,
    model_used text,
    created_at timestamptz
) AS $$
BEGIN
    -- Check if admin
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied: Admin only';
    END IF;
    
    RETURN QUERY
    SELECT 
        t.id,
        p.email as user_email,
        r.file_name as recording_name,
        t.request_type,
        t.chunk_index,
        t.input_tokens,
        t.output_tokens,
        t.total_tokens,
        t.model_used,
        t.created_at
    FROM public.token_usage_logs t
    LEFT JOIN public.profiles p ON p.id = t.user_id
    LEFT JOIN public.recordings r ON r.id = t.recording_id
    WHERE (p_user_id IS NULL OR t.user_id = p_user_id)
    ORDER BY t.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get overall platform stats
CREATE OR REPLACE FUNCTION public.admin_get_platform_token_stats()
RETURNS TABLE (
    total_users bigint,
    total_analyses bigint,
    total_input_tokens bigint,
    total_output_tokens bigint,
    total_tokens bigint,
    total_estimated_cost_usd numeric,
    avg_tokens_per_analysis numeric,
    most_used_model text,
    analyses_today bigint,
    tokens_today bigint
) AS $$
BEGIN
    -- Check if admin
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied: Admin only';
    END IF;
    
    RETURN QUERY
    SELECT 
        (SELECT COUNT(DISTINCT id) FROM public.profiles)::bigint as total_users,
        COUNT(a.id)::bigint as total_analyses,
        COALESCE(SUM(a.input_tokens), 0)::bigint as total_input_tokens,
        COALESCE(SUM(a.output_tokens), 0)::bigint as total_output_tokens,
        COALESCE(SUM(a.total_tokens), 0)::bigint as total_tokens,
        COALESCE(SUM(a.estimated_cost_usd), 0)::numeric as total_estimated_cost_usd,
        COALESCE(AVG(a.total_tokens), 0)::numeric as avg_tokens_per_analysis,
        (SELECT model_used FROM public.audio_analyses WHERE model_used IS NOT NULL GROUP BY model_used ORDER BY COUNT(*) DESC LIMIT 1) as most_used_model,
        COUNT(a.id) FILTER (WHERE a.created_at >= CURRENT_DATE)::bigint as analyses_today,
        COALESCE(SUM(a.total_tokens) FILTER (WHERE a.created_at >= CURRENT_DATE), 0)::bigint as tokens_today
    FROM public.audio_analyses a;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

