import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Dynamic import to avoid build issues
let GoogleGenAI: typeof import('@google/genai').GoogleGenAI
let createUserContent: typeof import('@google/genai').createUserContent
let createPartFromUri: typeof import('@google/genai').createPartFromUri

async function loadGenAI() {
  if (!GoogleGenAI) {
    const genai = await import('@google/genai')
    GoogleGenAI = genai.GoogleGenAI
    createUserContent = genai.createUserContent
    createPartFromUri = genai.createPartFromUri
  }
}

// Serverless function timeout (15 minutes for long audio)
export const maxDuration = 900

// Configuration
const MODEL_NAME = 'gemini-3-pro-preview'

// Gemini pricing (per 1M tokens)
const GEMINI_PRICING: Record<string, { input: number; output: number }> = {
  'gemini-3-pro-preview': { input: 2.00, output: 12.00 },
  'gemini-2.0-flash-exp': { input: 0.075, output: 0.30 },
}

// ============================================================================
// SALES COACHING PROMPT
// ============================================================================
const SALES_ANALYSIS_PROMPT = `You are an expert sales coach analyzing a sales call recording. 
Analyze this audio and provide a comprehensive sales coaching analysis.

IMPORTANT: Include specific timestamps [HH:MM:SS] for EVERY insight so the user can jump to that moment.

Return your analysis as a valid JSON object with this EXACT structure:

{
  "scorecard": {
    "total": <number 0-100>,
    "process": {
      "score": <number 0-100>,
      "weight": 60,
      "items": [
        {"name": "Sitdown/Opening", "score": <0-100>, "timestamp": "HH:MM:SS", "notes": "..."},
        {"name": "Rapport Building", "score": <0-100>, "timestamp": "HH:MM:SS", "notes": "..."},
        {"name": "Assessment Questions", "score": <0-100>, "timestamp": "HH:MM:SS", "notes": "..."},
        {"name": "Inspection/Discovery", "score": <0-100>, "timestamp": "HH:MM:SS", "notes": "..."},
        {"name": "Present Findings", "score": <0-100>, "timestamp": "HH:MM:SS", "notes": "..."},
        {"name": "Handle Objections", "score": <0-100>, "timestamp": "HH:MM:SS", "notes": "..."},
        {"name": "Price Presentation", "score": <0-100>, "timestamp": "HH:MM:SS", "notes": "..."},
        {"name": "Close/Next Steps", "score": <0-100>, "timestamp": "HH:MM:SS", "notes": "..."}
      ]
    },
    "skills": {
      "score": <number 0-100>,
      "weight": 30,
      "items": [
        {"name": "Building Rapport", "score": <0-100>, "notes": "..."},
        {"name": "Finding Compelling Need", "score": <0-100>, "notes": "..."},
        {"name": "Objection Handling", "score": <0-100>, "notes": "..."},
        {"name": "Closing", "score": <0-100>, "notes": "..."}
      ]
    },
    "communication": {
      "score": <number 0-100>,
      "weight": 10,
      "items": [
        {"name": "Pacing", "score": <0-100>, "notes": "..."},
        {"name": "Speaker Share", "score": <0-100>, "notes": "..."}
      ]
    }
  },
  
  "customer_analysis": {
    "needs_motivation": [
      {"text": "Customer need or motivation", "timestamps": ["HH:MM:SS", "HH:MM:SS"]}
    ],
    "pain_points": [
      {"text": "Specific problem or desire expressed", "timestamps": ["HH:MM:SS"]}
    ],
    "objections": [
      {"text": "Objection or hesitation", "type": "price|timing|trust|other", "timestamps": ["HH:MM:SS"]}
    ],
    "outcomes_next_steps": [
      {"text": "Agreement or follow-up action", "timestamps": ["HH:MM:SS"]}
    ]
  },
  
  "speaker_analytics": {
    "conversation_time": "Xh Ym Zs",
    "rep_speaking_time": "Xh Ym Zs",
    "customer_speaking_time": "Xh Ym Zs",
    "speaker_share_rep": <percentage>,
    "pacing_wpm": <words per minute>,
    "questions_asked": <number>,
    "questions_received": <number>,
    "longest_monologue": "Xm Ys",
    "exchanges": <number of back-and-forth>
  },
  
  "re_engage": {
    "recap": "Brief summary of the call and outcome",
    "first_price_quote": "$XX,XXX",
    "final_price_quote": "$XX,XXX with details",
    "financing": "Financing terms if discussed",
    "commitment": "Customer's commitment level and concerns",
    "main_objection": "Primary reason for hesitation",
    "emotional_tie": "Customer's emotional drivers",
    "recommended_action": "What the rep should do next",
    "suggested_message": "Draft follow-up message to send"
  },
  
  "transcript": [
    {"speaker": "Rep", "text": "...", "timestamp": "HH:MM:SS"},
    {"speaker": "Customer", "text": "...", "timestamp": "HH:MM:SS"}
  ],
  
  "summary": {
    "title": "Call title based on content",
    "customer_name": "Name if mentioned",
    "rep_name": "Name if mentioned",
    "call_outcome": "won|lost|pending|follow_up",
    "key_topics": ["topic1", "topic2"]
  }
}

Analyze the ENTIRE audio carefully. Be specific with timestamps.
For the transcript, include speaker labels and timestamps for each exchange.
Return ONLY valid JSON, no markdown or extra text.`

// ============================================================================
// Helper functions
// ============================================================================
function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateProgress(supabase: any, analysisId: string, message: string, progress?: number) {
  await supabase.from('audio_analyses').update({
    current_chunk_message: message,
    ...(progress !== undefined && { completed_chunks: progress }),
  }).eq('id', analysisId)
}

function getMimeType(filePath: string): string {
  if (filePath.endsWith('.wav')) return 'audio/wav'
  if (filePath.endsWith('.m4a')) return 'audio/mp4'
  if (filePath.endsWith('.mp4')) return 'audio/mp4'
  if (filePath.endsWith('.webm')) return 'audio/webm'
  if (filePath.endsWith('.ogg')) return 'audio/ogg'
  if (filePath.endsWith('.flac')) return 'audio/flac'
  return 'audio/mpeg' // default to mp3
}

// ============================================================================
// MAIN API HANDLER
// ============================================================================
export async function POST(request: Request) {
  try {
    // Load Gen AI SDK dynamically
    await loadGenAI()
    
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ message: 'Database not configured' }, { status: 500 })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const { recordingId, filePath } = await request.json()
    if (!recordingId || !filePath) {
      return NextResponse.json({ message: 'Missing recordingId or filePath' }, { status: 400 })
    }

    const geminiApiKey = process.env.GEMINI_API_KEY
    if (!geminiApiKey) {
      return NextResponse.json({ message: 'AI API key not configured' }, { status: 500 })
    }

    // Get recording details
    const { data: recording, error: recordingError } = await supabase
      .from('recordings')
      .select('*')
      .eq('id', recordingId)
      .eq('user_id', user.id)
      .single()

    if (recordingError || !recording) {
      return NextResponse.json({ message: 'Recording not found' }, { status: 404 })
    }

    const durationSeconds = recording.duration || 0
    const analysisFilePath = recording.analysis_file_path || filePath

    console.log(`📊 Starting analysis: ${recording.file_name} (${formatTime(durationSeconds)})`)

    // Create or update analysis record
    const { data: existingAnalysis } = await supabase
      .from('audio_analyses')
      .select('id, processing_status')
      .eq('recording_id', recordingId)
      .single()

    let analysisId: string

    if (existingAnalysis) {
      if (existingAnalysis.processing_status === 'processing') {
        return NextResponse.json({ message: 'Analysis already in progress' }, { status: 400 })
      }
      const { error: updateError } = await supabase.from('audio_analyses').update({
        processing_status: 'processing',
        current_chunk_message: 'Starting analysis...',
        error_message: null,
      }).eq('id', existingAnalysis.id)
      
      if (updateError) {
        console.error('❌ Failed to update analysis record:', updateError)
        return NextResponse.json({ 
          message: 'Failed to update analysis record', 
          error: updateError.message 
        }, { status: 500 })
      }
      analysisId = existingAnalysis.id
    } else {
      const { data: newAnalysis, error: createError } = await supabase
        .from('audio_analyses')
        .insert({
          recording_id: recordingId,
          processing_status: 'processing',
          current_chunk_message: 'Starting analysis...',
          // Required fields with defaults
          transcript: '[]',
          title: 'Analyzing...',
          summary: '',
          timeline: [],
          main_topics: [],
          glossary: [],
          insights: [],
          conclusion: '',
          language: 'en',
          confidence_score: 0,
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
          model_used: MODEL_NAME,
          estimated_cost_usd: 0,
        })
        .select()
        .single()

      if (createError || !newAnalysis) {
        console.error('❌ Failed to create analysis record:', createError)
        return NextResponse.json({ 
          message: 'Failed to create analysis record', 
          error: createError?.message,
          details: createError 
        }, { status: 500 })
      }
      analysisId = newAnalysis.id
    }

    // Start processing in background
    processAnalysis({
      supabase,
      geminiApiKey,
      analysisId,
      recordingId,
      filePath: analysisFilePath,
      durationSeconds,
    }).catch(err => console.error('Processing error:', err))

    return NextResponse.json({
      success: true,
      analysisId,
      message: 'Analysis started',
    })

  } catch (error) {
    console.error('❌ Analysis API error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    const errorStack = error instanceof Error ? error.stack : ''
    console.error('Stack:', errorStack)
    return NextResponse.json(
      { message: errorMessage, stack: errorStack },
      { status: 500 }
    )
  }
}

// ============================================================================
// MAIN PROCESSING FUNCTION - Using Files API
// ============================================================================
async function processAnalysis(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
  geminiApiKey: string
  analysisId: string
  recordingId: string
  filePath: string
  durationSeconds: number
}) {
  const { supabase, geminiApiKey, analysisId, recordingId, filePath, durationSeconds } = params

  try {
    // Initialize new Gen AI SDK
    const ai = new GoogleGenAI({ apiKey: geminiApiKey })

    // Step 1: Get signed URL from Supabase
    console.log('🔗 Getting signed URL...')
    await updateProgress(supabase, analysisId, 'Preparing audio file...')

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('audio-files')
      .createSignedUrl(filePath, 3600) // 1 hour expiry

    if (signedUrlError || !signedUrlData) {
      throw new Error('Failed to get signed URL for audio file')
    }

    // Step 2: Download file as blob and upload to Gemini Files API
    console.log('📤 Uploading to Gemini Files API...')
    await updateProgress(supabase, analysisId, 'Uploading to AI service...')

    const mimeType = getMimeType(filePath)
    
    // Fetch the file from Supabase
    const audioResponse = await fetch(signedUrlData.signedUrl)
    if (!audioResponse.ok) {
      throw new Error('Failed to fetch audio file')
    }
    
    const audioBlob = await audioResponse.blob()
    const audioBuffer = await audioBlob.arrayBuffer()
    
    // Upload to Gemini Files API
    const uploadResult = await ai.files.upload({
      file: new Blob([audioBuffer], { type: mimeType }),
      config: { mimeType },
    })

    if (!uploadResult.uri) {
      throw new Error('Failed to upload file to Gemini')
    }

    console.log(`✅ File uploaded: ${uploadResult.name}`)
    console.log(`📊 Audio duration: ${formatTime(durationSeconds)}`)

    // Step 3: Wait for file to be processed
    let file = uploadResult
    while (file.state === 'PROCESSING') {
      console.log('⏳ Waiting for file processing...')
      await updateProgress(supabase, analysisId, 'AI is processing audio file...')
      await new Promise(resolve => setTimeout(resolve, 5000))
      file = await ai.files.get({ name: file.name! })
    }

    if (file.state === 'FAILED') {
      throw new Error('File processing failed')
    }

    // Step 4: Generate analysis
    console.log('🤖 Generating analysis...')
    await updateProgress(supabase, analysisId, 'AI is analyzing the call...')

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: createUserContent([
        createPartFromUri(file.uri!, mimeType),
        SALES_ANALYSIS_PROMPT,
      ]),
      config: {
        temperature: 0.1,
        maxOutputTokens: 65536,
        responseMimeType: 'application/json',
      },
    })

    // Extract token usage
    const inputTokens = response.usageMetadata?.promptTokenCount || 0
    const outputTokens = response.usageMetadata?.candidatesTokenCount || 0
    const totalTokens = response.usageMetadata?.totalTokenCount || 0

    console.log(`📊 Tokens: ${inputTokens} in, ${outputTokens} out, ${totalTokens} total`)

    // Parse response
    const responseText = response.text || ''
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let analysisResult: any

    try {
      analysisResult = JSON.parse(responseText)
    } catch {
      // Try to extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('Failed to parse AI response as JSON')
      }
    }

    // Step 5: Save results
    const pricing = GEMINI_PRICING[MODEL_NAME] || GEMINI_PRICING['gemini-3-pro-preview']
    const estimatedCost = (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output

    await supabase.from('audio_analyses').update({
      // Main data
      title: analysisResult.summary?.title || 'Sales Call Analysis',
      summary: analysisResult.re_engage?.recap || analysisResult.summary?.title || '',
      transcript: JSON.stringify(analysisResult.transcript || []),
      
      // New sales coaching fields
      scorecard: analysisResult.scorecard || null,
      customer_analysis: analysisResult.customer_analysis || null,
      speaker_analytics: analysisResult.speaker_analytics || null,
      re_engage: analysisResult.re_engage || null,
      
      // Legacy fields
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      timeline: analysisResult.transcript?.filter((_: any, i: number) => i % 10 === 0).map((t: any) => ({
        start_time: t.timestamp,
        end_time: t.timestamp,
        title: t.text?.substring(0, 50) + '...',
        summary: t.text,
      })) || [],
      main_topics: analysisResult.summary?.key_topics || [],
      
      // Metadata
      processing_status: 'done',
      current_chunk_message: 'Analysis complete!',
      confidence_score: 0.9,
      duration_analyzed: durationSeconds,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      model_used: MODEL_NAME,
      estimated_cost_usd: estimatedCost,
    }).eq('id', analysisId)

    await supabase.from('recordings').update({ status: 'done' }).eq('id', recordingId)

    // Step 6: Cleanup - delete file from Gemini (optional, auto-deletes after 48h)
    try {
      await ai.files.delete({ name: file.name! })
      console.log('🗑️ Cleaned up uploaded file')
    } catch {
      // Ignore cleanup errors
    }

    console.log(`🎉 Analysis complete! Tokens: ${totalTokens}, Cost: $${estimatedCost.toFixed(4)}`)

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error('❌ Processing error:', errMsg)

    await supabase.from('audio_analyses').update({
      processing_status: 'error',
      error_message: errMsg.substring(0, 500),
      current_chunk_message: 'Error occurred',
    }).eq('id', analysisId)

    await supabase.from('recordings').update({ status: 'error' }).eq('id', recordingId)
  }
}
