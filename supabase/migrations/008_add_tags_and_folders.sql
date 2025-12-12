-- Migration: Add tags and folders for recording organization
-- Created: 2024

-- =====================================================
-- FOLDERS TABLE - for organizing recordings
-- =====================================================
CREATE TABLE IF NOT EXISTS folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1', -- Default indigo color
  icon TEXT DEFAULT 'folder', -- Icon name
  parent_id UUID REFERENCES folders(id) ON DELETE SET NULL, -- For nested folders
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name, parent_id)
);

-- RLS for folders
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own folders"
  ON folders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own folders"
  ON folders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own folders"
  ON folders FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own folders"
  ON folders FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- TAGS TABLE - for labeling recordings
-- =====================================================
CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#10b981', -- Default emerald color
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- RLS for tags
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tags"
  ON tags FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own tags"
  ON tags FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tags"
  ON tags FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tags"
  ON tags FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- RECORDING_TAGS - many-to-many relationship
-- =====================================================
CREATE TABLE IF NOT EXISTS recording_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id UUID NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(recording_id, tag_id)
);

-- RLS for recording_tags
ALTER TABLE recording_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own recording tags"
  ON recording_tags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM recordings WHERE recordings.id = recording_tags.recording_id AND recordings.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can add tags to own recordings"
  ON recording_tags FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM recordings WHERE recordings.id = recording_tags.recording_id AND recordings.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can remove tags from own recordings"
  ON recording_tags FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM recordings WHERE recordings.id = recording_tags.recording_id AND recordings.user_id = auth.uid()
    )
  );

-- =====================================================
-- ADD FOLDER REFERENCE TO RECORDINGS
-- =====================================================
ALTER TABLE recordings ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES folders(id) ON DELETE SET NULL;

-- =====================================================
-- BOOKMARKS TABLE - for marking important moments
-- =====================================================
CREATE TABLE IF NOT EXISTS bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id UUID NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp_seconds INTEGER NOT NULL, -- Position in audio in seconds
  title TEXT NOT NULL,
  note TEXT,
  color TEXT DEFAULT '#f59e0b', -- Default amber color
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for bookmarks
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bookmarks"
  ON bookmarks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own bookmarks"
  ON bookmarks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own bookmarks"
  ON bookmarks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own bookmarks"
  ON bookmarks FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- COMMENTS TABLE - for discussion on recordings
-- =====================================================
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id UUID NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES comments(id) ON DELETE CASCADE, -- For replies
  content TEXT NOT NULL,
  timestamp_seconds INTEGER, -- Optional: link to specific moment
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for comments
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Users can view comments on their own recordings OR comments they made
CREATE POLICY "Users can view comments on own recordings"
  ON comments FOR SELECT
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM recordings WHERE recordings.id = comments.recording_id AND recordings.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create comments on accessible recordings"
  ON comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own comments"
  ON comments FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments"
  ON comments FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- SHARED RECORDINGS TABLE - for sharing with others
-- =====================================================
CREATE TABLE IF NOT EXISTS shared_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id UUID NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  shared_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_with UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- NULL = public link
  share_token TEXT UNIQUE, -- For public links
  permissions TEXT DEFAULT 'view', -- view, comment, edit
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for shared_recordings
ALTER TABLE shared_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their shared recordings"
  ON shared_recordings FOR SELECT
  USING (
    auth.uid() = shared_by OR 
    auth.uid() = shared_with OR
    share_token IS NOT NULL -- Public links are viewable
  );

CREATE POLICY "Users can share own recordings"
  ON shared_recordings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM recordings WHERE recordings.id = shared_recordings.recording_id AND recordings.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can revoke own shares"
  ON shared_recordings FOR DELETE
  USING (auth.uid() = shared_by);

-- =====================================================
-- INDEXES for performance
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id);
CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);
CREATE INDEX IF NOT EXISTS idx_recording_tags_recording_id ON recording_tags(recording_id);
CREATE INDEX IF NOT EXISTS idx_recording_tags_tag_id ON recording_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_recordings_folder_id ON recordings(folder_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_recording_id ON bookmarks(recording_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_recording_id ON comments(recording_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_shared_recordings_token ON shared_recordings(share_token);
CREATE INDEX IF NOT EXISTS idx_shared_recordings_shared_with ON shared_recordings(shared_with);

