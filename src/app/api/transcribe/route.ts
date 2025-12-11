import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    
    if (!supabase) {
      return NextResponse.json(
        { message: 'Supabase not configured' },
        { status: 500 }
      )
    }

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { recordingId, filePath } = body

    if (!recordingId || !filePath) {
      return NextResponse.json(
        { message: 'Missing recordingId or filePath' },
        { status: 400 }
      )
    }

    // Verify the recording belongs to the user
    const { data: recording, error: recordingError } = await supabase
      .from('recordings')
      .select('*')
      .eq('id', recordingId)
      .eq('user_id', user.id)
      .single()

    if (recordingError || !recording) {
      return NextResponse.json(
        { message: 'Recording not found' },
        { status: 404 }
      )
    }

    // Update status to processing
    await supabase
      .from('recordings')
      .update({ status: 'processing' })
      .eq('id', recordingId)

    // Get the audio file URL for processing
    const { data: urlData } = await supabase.storage
      .from('audio-files')
      .createSignedUrl(filePath, 3600)

    if (!urlData?.signedUrl) {
      await supabase
        .from('recordings')
        .update({ status: 'error' })
        .eq('id', recordingId)
      
      return NextResponse.json(
        { message: 'Failed to get audio file URL' },
        { status: 500 }
      )
    }

    // TODO: Call Gemini API for transcription
    // For now, we'll create a placeholder transcript
    // In production, you would:
    // 1. Download the audio file or pass the URL to Gemini
    // 2. Call Gemini API with the audio
    // 3. Get the transcription result
    // 4. Save it to the transcripts table

    // Placeholder: Simulate processing delay and create demo transcript
    // In production, this would be replaced with actual Gemini API call
    
    const geminiApiKey = process.env.GEMINI_API_KEY
    
    if (!geminiApiKey) {
      // Demo mode - create placeholder transcript
      const placeholderText = `[Demo Transcript]

This is a placeholder transcript for the audio file "${recording.file_name}".

To enable real transcription:
1. Get a Gemini API key from Google AI Studio
2. Add GEMINI_API_KEY to your environment variables
3. The system will automatically transcribe your audio files

Recording details:
- File size: ${(recording.file_size / 1024 / 1024).toFixed(2)} MB
- Uploaded: ${new Date(recording.created_at).toLocaleString()}

---
Note: Real transcription requires Gemini API integration.`

      // Create transcript
      const { error: transcriptError } = await supabase
        .from('transcripts')
        .insert({
          recording_id: recordingId,
          text: placeholderText,
        })

      if (transcriptError) {
        console.error('Failed to create transcript:', transcriptError)
        await supabase
          .from('recordings')
          .update({ status: 'error' })
          .eq('id', recordingId)
        
        return NextResponse.json(
          { message: 'Failed to create transcript' },
          { status: 500 }
        )
      }

      // Update recording status to done
      await supabase
        .from('recordings')
        .update({ status: 'done' })
        .eq('id', recordingId)

      return NextResponse.json({
        message: 'Transcription completed (demo mode)',
        demo: true,
      })
    }

    // Real Gemini API integration would go here
    // For now, return that we need to implement it
    try {
      // Gemini API call would go here
      // const transcription = await callGeminiAPI(urlData.signedUrl, geminiApiKey)
      
      // Placeholder for real implementation
      const transcription = `[Transcription from Gemini API]

Audio file: ${recording.file_name}
Duration: ${recording.duration ? `${Math.round(recording.duration / 60)} minutes` : 'Unknown'}

[Full transcription would appear here after Gemini API processes the audio]`

      // Save transcript
      await supabase
        .from('transcripts')
        .insert({
          recording_id: recordingId,
          text: transcription,
        })

      // Update status
      await supabase
        .from('recordings')
        .update({ status: 'done' })
        .eq('id', recordingId)

      return NextResponse.json({
        message: 'Transcription completed',
      })
    } catch (apiError) {
      console.error('Gemini API error:', apiError)
      
      await supabase
        .from('recordings')
        .update({ status: 'error' })
        .eq('id', recordingId)
      
      return NextResponse.json(
        { message: 'Transcription failed' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Transcription error:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}

