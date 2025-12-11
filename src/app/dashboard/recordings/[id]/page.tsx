import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import RecordingDetailClient from './RecordingDetailClient'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function RecordingDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  
  if (!supabase) {
    redirect('/login')
  }
  
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  
  if (userError || !user) {
    redirect('/login')
  }

  // Fetch recording with transcript
  const { data: recording, error: recordingError } = await supabase
    .from('recordings')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (recordingError || !recording) {
    notFound()
  }

  // Fetch transcript if exists
  const { data: transcript } = await supabase
    .from('transcripts')
    .select('*')
    .eq('recording_id', id)
    .single()

  return (
    <RecordingDetailClient 
      recording={recording} 
      transcript={transcript} 
      user={user}
    />
  )
}

