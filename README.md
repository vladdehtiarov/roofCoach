# RoofCoach

A Next.js application with Supabase for user authentication, audio file uploads (up to 3 hours), and AI-powered transcription.

## Features

- 🔐 **User Authentication** - Sign up, sign in with email/password
- 👤 **User Roles** - Support for user and admin roles
- 📁 **Audio File Upload** - Drag & drop support, progress tracking
- 🎵 **Audio Playback** - Built-in audio player
- 📝 **Transcription** - AI-powered transcription (Gemini API)
- 📱 **Responsive Design** - Works on desktop and mobile
- 🔒 **Secure Storage** - Files stored in Supabase Storage with RLS

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Database & Auth**: Supabase (PostgreSQL)
- **Styling**: Tailwind CSS
- **Language**: TypeScript

## Database Schema

```
profiles (1) ─── (∞) recordings ─── (∞) transcripts
```

- **profiles** - User profiles with roles (user/admin)
- **recordings** - Audio file metadata with status tracking
- **transcripts** - AI-generated transcription text

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account

### 1. Clone and Install

```bash
cd RoofCoach
npm install
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)

2. Go to **Project Settings** → **API** and copy:
   - Project URL
   - anon public key

3. Create a `.env.local` file in the project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Set Up Database Schema

1. Go to **SQL Editor** in your Supabase dashboard

2. Copy and run the migration file: `supabase/migrations/001_initial_schema.sql`

This will create:
- `profiles` table with automatic user profile creation on signup
- `recordings` table for audio metadata
- `transcripts` table for transcription text
- All necessary RLS policies
- Helper view `recordings_with_status`

### 4. Set Up Supabase Storage

1. Go to **Storage** in your Supabase dashboard

2. Create a new bucket called `audio-files`

3. Set the bucket to **Public** (for audio playback) or configure RLS policies:

```sql
-- Allow users to upload files to their own folder
CREATE POLICY "Users can upload to own folder"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'audio-files' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to read their own files
CREATE POLICY "Users can read own files"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'audio-files' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to delete their own files
CREATE POLICY "Users can delete own files"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'audio-files' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);
```

### 5. Configure Authentication

1. Go to **Authentication** → **Providers** in Supabase

2. Enable **Email** provider

3. (Optional) Disable email confirmation for development:
   - Go to **Authentication** → **Settings**
   - Turn off "Enable email confirmations"

### 6. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
src/
├── app/
│   ├── auth/callback/        # OAuth callback handler
│   ├── dashboard/            # Main dashboard
│   ├── login/                # Login page
│   ├── signup/               # Signup page
│   ├── globals.css           # Global styles
│   ├── layout.tsx            # Root layout
│   └── page.tsx              # Landing page
├── components/
│   └── AudioUploader.tsx     # Audio upload component
├── lib/supabase/
│   ├── client.ts             # Browser client
│   ├── server.ts             # Server client
│   └── middleware.ts         # Auth middleware helper
├── types/
│   └── database.ts           # TypeScript types for DB
└── middleware.ts             # Next.js middleware

supabase/
└── migrations/
    └── 001_initial_schema.sql  # Database schema
```

## Data Flow

1. User signs up → profile created automatically via trigger
2. User uploads audio → recording created with status 'uploading'
3. File uploaded to Storage → status updated to 'done'
4. Edge Function processes audio → creates transcript
5. Dashboard shows recordings with transcripts

## Audio Upload Limits

- **Max file size**: 500MB
- **Supported formats**: MP3, WAV, OGG, FLAC, M4A, AAC, WebM
- **Duration**: Up to 3 hours of audio

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon/public key |

## Admin Features

Admins can:
- View all users' profiles
- View all recordings
- View all transcripts

To make a user admin, update their profile:

```sql
UPDATE profiles SET role = 'admin' WHERE email = 'admin@example.com';
```

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy!

### Other Platforms

Build the production version:

```bash
npm run build
npm start
```

## License

MIT
