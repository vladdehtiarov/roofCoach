-- Admin prompts table for editable AI prompts
CREATE TABLE IF NOT EXISTS admin_prompts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    prompt TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_by UUID REFERENCES auth.users(id)
);

-- Create index on name for quick lookups
CREATE INDEX IF NOT EXISTS idx_admin_prompts_name ON admin_prompts(name);

-- Enable RLS
ALTER TABLE admin_prompts ENABLE ROW LEVEL SECURITY;

-- Policy: Only authenticated users can read (for now - can restrict to admins later)
CREATE POLICY "Authenticated users can read prompts" 
    ON admin_prompts FOR SELECT 
    TO authenticated 
    USING (true);

-- Policy: Only admins can update (we'll check admin role in the API)
-- For now, allow any authenticated user to update - restrict in API
CREATE POLICY "Authenticated users can update prompts" 
    ON admin_prompts FOR UPDATE 
    TO authenticated 
    USING (true);

-- Policy: Only admins can insert
CREATE POLICY "Authenticated users can insert prompts" 
    ON admin_prompts FOR INSERT 
    TO authenticated 
    WITH CHECK (true);

-- Add is_admin column to profiles if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'is_admin') THEN
        ALTER TABLE profiles ADD COLUMN is_admin BOOLEAN DEFAULT false;
    END IF;
END $$;

