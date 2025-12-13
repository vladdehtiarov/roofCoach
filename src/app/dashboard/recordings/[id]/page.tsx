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

  // Fetch analysis if exists - but NOT the heavy transcript field
  // Transcript will be loaded lazily on the client
  const { data: analysis } = await supabase
    .from('audio_analyses')
    .select(`
      id,
      recording_id,
      processing_status,
      error_message,
      current_chunk_message,
      title,
      summary,
      scorecard,
      customer_analysis,
      speaker_analytics,
      re_engage,
      timeline,
      main_topics,
      duration_analyzed,
      language,
      confidence_score,
      input_tokens,
      output_tokens,
      total_tokens,
      model_used,
      estimated_cost_usd,
      created_at,
      updated_at
    `)
    .eq('recording_id', id)
    .single()

  return (
    <RecordingDetailClient 
      recording={recording} 
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      analysis={analysis as any}
      user={user}
    />
  )
}

